import Groq from 'groq-sdk'
import { Prisma } from '@prisma/client'
import { db } from '../db'
import type { ValidationIssue } from './validate'

const client = new Groq()

export interface AIExplanation {
  explanation: string
  fixSuggestion: string
  source: 'cache' | 'ai'
}

// Strip query params so /users?page=1 and /users?page=2 share the same cache key.
function normalizeEndpoint(method: string, url: string): string {
  try {
    const { host, pathname } = new URL(url)
    return `${method.toUpperCase()} ${host}${pathname}`
  } catch {
    return `${method.toUpperCase()} ${url}`
  }
}

// Derive a stable fingerprint from the error code/type in the response body.
// Same endpoint + status code can have different root causes (api_key_expired vs invalid_api_key),
// and the cache must not serve an explanation written for a different error.
function errorSignature(responseBody: unknown): string {
  if (typeof responseBody !== 'object' || responseBody === null) return ''
  const b = responseBody as Record<string, unknown>
  const err = b['error'] as Record<string, unknown> | undefined
  const candidates = [
    err?.['code'],      // Stripe: { error: { code: 'api_key_expired' } }
    err?.['type'],      // Stripe: { error: { type: 'invalid_request_error' } }
    b['code'],          // generic: { code: 'UNAUTHORIZED' }
    b['error_code'],    // some APIs: { error_code: '...' }
    b['type'],          // some APIs: { type: '...' }
  ]
  return candidates.filter(v => typeof v === 'string' && v).join(':')
}

async function findCached(endpoint: string, statusCode: number, sig: string): Promise<AIExplanation | null> {
  // Fetch recent candidates — filter by signature in memory so no schema change is needed.
  const rows = await db.requestHistory.findMany({
    where: {
      url: { contains: endpoint.split(' ')[1] ?? '' },
      statusCode,
      layer3Result: { not: Prisma.JsonNull },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { layer3Result: true, responseBody: true },
  })

  for (const row of rows) {
    if (!row.layer3Result || typeof row.layer3Result !== 'object' || Array.isArray(row.layer3Result)) continue
    // Reject cache hits where the stored response has a different error signature.
    if (sig && errorSignature(row.responseBody) !== sig) continue
    const cached = row.layer3Result as Record<string, unknown>
    if (typeof cached['explanation'] !== 'string' || typeof cached['fixSuggestion'] !== 'string') continue
    return { explanation: cached['explanation'], fixSuggestion: cached['fixSuggestion'], source: 'cache' }
  }
  return null
}

function buildPrompt(ctx: {
  method: string
  url: string
  requestBody: unknown
  statusCode: number
  responseBody: unknown
  warnings: ValidationIssue[]
  recentHistory: Array<{ statusCode: number; responseTime: number; createdAt: Date }>
}): string {
  const warningLines = ctx.warnings.length > 0
    ? ctx.warnings.map(w => `  [${w.code}] ${w.message}`).join('\n')
    : '  (none)'

  const historyLines = ctx.recentHistory.length > 0
    ? ctx.recentHistory.slice(0, 5).map(h =>
        `  ${h.statusCode} — ${h.responseTime}ms at ${h.createdAt.toISOString()}`
      ).join('\n')
    : '  (no prior requests for this endpoint)'

  const requestBodyStr = ctx.requestBody !== undefined
    ? JSON.stringify(ctx.requestBody, null, 2)
    : '(no body)'

  const responseBodyStr = typeof ctx.responseBody === 'string'
    ? ctx.responseBody
    : JSON.stringify(ctx.responseBody, null, 2)

  return `You are an expert API debugger helping a developer understand why their API request failed.

REQUEST
  ${ctx.method.toUpperCase()} ${ctx.url}
  Body: ${requestBodyStr}

RESPONSE
  Status: ${ctx.statusCode}
  Body: ${responseBodyStr.slice(0, 2000)}${responseBodyStr.length > 2000 ? '\n  ... (truncated)' : ''}

ANALYSIS LAYER FLAGS
${warningLines}

RECENT HISTORY FOR THIS ENDPOINT
${historyLines}

Respond with a JSON object with exactly two fields:
- "explanation": 2–4 sentences explaining why this request failed. Be specific about what is wrong — reference the actual status code, error message, and request details. Do not be generic.
- "fixSuggestion": 1–3 concrete steps the developer should take right now to fix it. Be direct and actionable.

Respond with only the raw JSON object, no markdown fences.`
}

export async function explainFailure(ctx: {
  method: string
  url: string
  requestBody: unknown
  statusCode: number
  responseBody: unknown
  warnings: ValidationIssue[]
  historyId: string
}): Promise<AIExplanation> {
  const endpoint = normalizeEndpoint(ctx.method, ctx.url)
  const sig = errorSignature(ctx.responseBody)

  // Cache key: endpoint + status code + error signature (code/type from response body).
  // Without the signature, api_key_expired and invalid_api_key would share the same cache entry.
  const cached = await findCached(endpoint, ctx.statusCode, sig)
  if (cached) {
    // Still update this history row to point to the cached result
    await db.requestHistory.update({
      where: { id: ctx.historyId },
      data: { layer3Result: cached as unknown as object },
    }).catch(() => { /* non-fatal */ })
    return cached
  }

  // Fetch the last 10 responses for this endpoint to give the AI context
  const recentHistory = await db.requestHistory.findMany({
    where: { method: ctx.method.toUpperCase(), url: { contains: endpoint.split(' ')[1] ?? '' } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { statusCode: true, responseTime: true, createdAt: true },
  }).catch(() => [])

  const prompt = buildPrompt({ ...ctx, recentHistory })

  const message = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 512,
    messages: [
      { role: 'system', content: 'You are an expert API debugger. Always respond with valid JSON only.' },
      { role: 'user', content: prompt },
    ],
  })

  const raw = message.choices[0]?.message?.content ?? ''

  let parsed: { explanation?: string; fixSuggestion?: string } = {}
  try {
    parsed = JSON.parse(raw)
  } catch {
    // If the model wraps in markdown fences, strip them
    const match = raw.match(/```(?:json)?\s*([\s\S]+?)```/)
    if (match) {
      try { parsed = JSON.parse(match[1]) } catch { /* fall through */ }
    }
  }

  const result: AIExplanation = {
    explanation: parsed.explanation ?? 'Could not generate explanation.',
    fixSuggestion: parsed.fixSuggestion ?? 'Check the response body and API documentation.',
    source: 'ai',
  }

  // Persist so the next identical failure is served from cache
  await db.requestHistory.update({
    where: { id: ctx.historyId },
    data: { layer3Result: result as unknown as object },
  }).catch(() => { /* non-fatal */ })

  return result
}
