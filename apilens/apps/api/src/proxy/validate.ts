import { promises as dns } from 'dns'

export interface ValidationIssue {
  code: string
  severity: 'error' | 'warning'
  message: string
}

interface ValidatableRequest {
  method: string
  url: string
  headers: Record<string, string>
  body?: unknown
}

function ipToU32(ip: string): number {
  return ip.split('.').reduce((acc, octet) => ((acc * 256) + parseInt(octet, 10)) >>> 0, 0)
}

// Loopback, RFC1918, link-local, CGNAT, unspecified
const BLOCKED_IPV4: [number, number][] = [
  [ipToU32('0.0.0.0'),   ipToU32('0.255.255.255')],
  [ipToU32('10.0.0.0'),  ipToU32('10.255.255.255')],
  [ipToU32('100.64.0.0'),ipToU32('100.127.255.255')],
  [ipToU32('127.0.0.0'), ipToU32('127.255.255.255')],
  [ipToU32('169.254.0.0'),ipToU32('169.254.255.255')],
  [ipToU32('172.16.0.0'),ipToU32('172.31.255.255')],
  [ipToU32('192.168.0.0'),ipToU32('192.168.255.255')],
]

function isBlockedIPv4(ip: string): boolean {
  const n = ipToU32(ip)
  return BLOCKED_IPV4.some(([lo, hi]) => n >= lo && n <= hi)
}

function isBlockedIPv6(ip: string): boolean {
  const l = ip.toLowerCase()
  return l === '::1' || /^f[cd]/i.test(l) || /^fe[89ab]/i.test(l)
}

async function resolveAddresses(hostname: string): Promise<string[]> {
  try {
    const results = await dns.lookup(hostname, { all: true })
    return results.map(r => r.address)
  } catch {
    return []
  }
}

export async function validateRequest(req: ValidatableRequest): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []

  // 1. URL must parse
  let parsed: URL
  try {
    parsed = new URL(req.url)
  } catch {
    issues.push({ code: 'INVALID_URL', severity: 'error', message: `"${req.url}" is not a valid URL.` })
    return issues
  }

  // 2. Only http/https
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    issues.push({
      code: 'DISALLOWED_PROTOCOL',
      severity: 'error',
      message: `Protocol "${parsed.protocol}" is not allowed. Only http and https are supported.`,
    })
    return issues
  }

  // 3. SSRF — block private/loopback targets
  const addrs = await resolveAddresses(parsed.hostname)
  for (const addr of addrs) {
    if (isBlockedIPv4(addr) || isBlockedIPv6(addr)) {
      issues.push({
        code: 'SSRF_BLOCKED',
        severity: 'error',
        message: `Request blocked: "${parsed.hostname}" resolves to ${addr}, which is a private or loopback address.`,
      })
      return issues
    }
  }

  // 4. Missing Content-Type on body requests
  const method = req.method.toUpperCase()
  const hasBody = req.body !== undefined && !['GET', 'HEAD'].includes(method)
  if (hasBody) {
    const ct = Object.entries(req.headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1]
    if (!ct) {
      issues.push({
        code: 'MISSING_CONTENT_TYPE',
        severity: 'warning',
        message: `${method} request has a body but no Content-Type header. The server may reject or misinterpret the request.`,
      })
    }
  }

  return issues
}
