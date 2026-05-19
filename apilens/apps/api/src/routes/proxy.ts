import { Router, Request, Response } from 'express'
import { forwardRequest } from '../proxy/engine'
import { validateRequest } from '../proxy/validate'
import { recordAndAnalyze } from '../proxy/heuristics'
import { explainFailure } from '../proxy/ai'
import { getSpec } from '../spec/loader'
import { validateRequestAgainstSpec, validateResponseAgainstSpec } from '../spec/validator'
import { db } from '../db'

const router = Router()

router.post('/request', async (req: Request, res: Response) => {
  const { method, url, headers = {}, body, specKey, triggerAI = false } = req.body

  if (!method || !url) {
    res.status(400).json({ error: '`method` and `url` are required.' })
    return
  }

  // Layer 1: SSRF, URL validity, content-type checks
  const issues = await validateRequest({ method, url, headers, body })
  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warning')

  if (errors.length > 0) {
    res.status(400).json({ error: errors[0].message, code: errors[0].code, layer1Flags: issues, layer2Flags: [], blocked: true })
    return
  }

  // Layer 1: Spec validation (request body against OpenAPI schema)
  if (specKey) {
    const spec = getSpec(specKey)
    if (spec) {
      const specIssues = validateRequestAgainstSpec(spec.doc, method, url, body, headers as Record<string, string>)
      const specErrors = specIssues.filter(i => i.severity === 'error')
      if (specErrors.length > 0) {
        res.status(400).json({ error: specErrors[0].message, code: specErrors[0].code, layer1Flags: [...issues, ...specIssues], layer2Flags: [], blocked: true })
        return
      }
      warnings.push(...specIssues.filter(i => i.severity === 'warning'))
    }
  }

  try {
    const result = await forwardRequest({ method, url, headers, body })

    // Layer 2: Heuristics (latency, auth patterns, known error strings)
    const heuristicHints = await recordAndAnalyze(method, url, result.statusCode, result.responseTime, result.body)

    // Layer 1: Spec validation (response body against OpenAPI schema)
    const loadedSpec = specKey ? getSpec(specKey) : undefined
    const responseSpecIssues = loadedSpec
      ? validateResponseAgainstSpec(loadedSpec.doc, method, url, result.statusCode, result.body)
      : []

    const layer1Flags = [...warnings, ...result.warnings, ...responseSpecIssues]
    const layer2Flags = heuristicHints
    const allWarnings = [...layer1Flags, ...layer2Flags]

    // Persist request history to Postgres (fire-and-forget — never blocks the response)
    const historyRow = await db.requestHistory.create({
      data: {
        method: method.toUpperCase(),
        url,
        sentHeaders: headers as object,
        sentBody: body ?? null,
        statusCode: result.statusCode,
        responseBody: result.body as object,
        responseTime: result.responseTime,
        layer1Flags: layer1Flags as object[],
        layer2Flags: layer2Flags as object[],
      },
    }).catch((err: Error) => {
      console.error('[History] Failed to persist:', err.message)
      return null
    })

    // Layer 3: AI Triage — auto on 4xx/5xx, manual via triggerAI flag
    let aiExplanation = null
    if (historyRow && (result.statusCode >= 400 || triggerAI)) {
      if (!process.env.GROQ_API_KEY) {
        console.warn('[AI] GROQ_API_KEY is not set — skipping Layer 3')
      } else {
        aiExplanation = await explainFailure({
          method,
          url,
          requestBody: body,
          statusCode: result.statusCode,
          responseBody: result.body,
          warnings: allWarnings,
          historyId: historyRow.id,
        }).catch(err => {
          console.error('[AI] Layer 3 failed:', err.message)
          return null
        })
      }
    }

    const { warnings: _engineWarnings, ...proxyFields } = result
    res.json({
      ...proxyFields,
      layer1Flags,
      layer2Flags,
      historyId: historyRow?.id ?? null,
      aiExplanation,
    })
  } catch (err) {
    res.status(502).json({ error: 'Upstream request failed.', detail: String(err) })
  }
})

// Manual AI explain for a saved history row (used by the "Explain" button on 4xx/5xx responses)
router.post('/explain', async (req: Request, res: Response) => {
  const { historyId } = req.body

  if (!historyId) {
    res.status(400).json({ error: '`historyId` is required.' })
    return
  }

  const row = await db.requestHistory.findUnique({ where: { id: historyId } }).catch(() => null)
  if (!row) {
    res.status(404).json({ error: 'History entry not found.' })
    return
  }

  if (row.statusCode < 400) {
    res.status(400).json({ error: 'AI triage is only available for failed requests (4xx/5xx).' })
    return
  }

  if (!process.env.GROQ_API_KEY) {
    res.status(503).json({ error: 'GROQ_API_KEY is not configured on the server.' })
    return
  }

  const aiExplanation = await explainFailure({
    method: row.method,
    url: row.url,
    requestBody: row.sentBody,
    statusCode: row.statusCode,
    responseBody: row.responseBody,
    warnings: (row.layer1Flags as object[] ?? []).concat(row.layer2Flags as object[] ?? []) as Array<{ code: string; severity: 'error' | 'warning'; message: string }>,
    historyId: row.id,
  }).catch(err => {
    console.error('[AI] Manual explain failed:', err.message)
    return null
  })

  if (!aiExplanation) {
    res.status(500).json({ error: 'AI explanation failed. Check server logs.' })
    return
  }

  res.json({ aiExplanation })
})

export default router
