import type { ValidationIssue } from './validate'

export interface ProxyRequest {
  method: string
  url: string
  headers: Record<string, string>
  body?: unknown
}

export interface ProxyResult {
  statusCode: number
  headers: Record<string, string>
  body: unknown
  responseTime: number
  warnings: ValidationIssue[]
}

// These headers describe the connection itself, not the message.
// They must not be forwarded to the upstream server.
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailers',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate',
  'host',
])

function stripHopByHop(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !HOP_BY_HOP.has(key.toLowerCase()))
  )
}

export async function forwardRequest(req: ProxyRequest): Promise<ProxyResult> {
  const forwardedHeaders = stripHopByHop(req.headers)

  const hasBody = req.body !== undefined && !['GET', 'HEAD'].includes(req.method.toUpperCase())

  const fetchOptions: RequestInit = {
    method: req.method.toUpperCase(),
    headers: forwardedHeaders,
    ...(hasBody && { body: JSON.stringify(req.body) }),
  }

  const start = Date.now()
  const upstream = await fetch(req.url, fetchOptions)
  const responseTime = Date.now() - start

  // Read the response body as text first so we can attempt JSON parsing.
  // If it's not valid JSON (e.g. HTML error pages), return it as a string.
  const text = await upstream.text()
  const warnings: ValidationIssue[] = []
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = text
    const ct = upstream.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      warnings.push({
        code: 'RESPONSE_BODY_NOT_JSON',
        severity: 'warning',
        message: `Response Content-Type is "${ct}" but the body is not valid JSON.`,
      })
    }
  }

  const responseHeaders: Record<string, string> = {}
  upstream.headers.forEach((value, key) => {
    responseHeaders[key] = value
  })

  return {
    statusCode: upstream.status,
    headers: responseHeaders,
    body,
    responseTime,
    warnings,
  }
}
