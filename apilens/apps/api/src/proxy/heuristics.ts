import { redis } from '../redis'
import type { ValidationIssue } from './validate'

const WINDOW_SIZE = 50         // keep last 50 latency readings per endpoint
const MIN_SAMPLES = 5          // need at least this many readings before flagging
const ANOMALY_MULTIPLIER = 2.0 // flag when current > 2x historical average
const AUTH_FAIL_THRESHOLD = 3  // flag after this many consecutive 401s

// Normalize to "METHOD host/path" — strips query params so /users?page=1 and
// /users?page=2 count toward the same endpoint's history.
function endpointKey(method: string, url: string): string {
  try {
    const { host, pathname } = new URL(url)
    return `${method.toUpperCase()} ${host}${pathname}`
  } catch {
    return `${method.toUpperCase()} ${url}`
  }
}

const KNOWN_PATTERNS: { re: RegExp; code: string; message: string }[] = [
  {
    re: /invalid api[- ]?key|api[- ]?key.*invalid|unauthorized.*key/i,
    code: 'AUTH_BAD_KEY',
    message: 'Response body suggests an invalid API key. Check your Authorization header or key value.',
  },
  {
    re: /rate[ -]?limit(ed)?|too many requests|throttled?/i,
    code: 'RATE_LIMITED',
    message: 'Response indicates rate limiting. Slow down requests or check your plan quota.',
  },
  {
    re: /token.*expired|expired.*token|jwt expired/i,
    code: 'TOKEN_EXPIRED',
    message: 'Response suggests an expired token. Refresh your access token and retry.',
  },
  {
    re: /ECONNREFUSED|connection refused/i,
    code: 'CONN_REFUSED',
    message: 'The upstream server actively refused the connection. Check that the service is running.',
  },
]

export async function recordAndAnalyze(
  method: string,
  url: string,
  statusCode: number,
  responseTime: number,
  responseBody: unknown,
): Promise<ValidationIssue[]> {
  const hints: ValidationIssue[] = []

  try {
    const endpoint = endpointKey(method, url)

    // ── 1. Latency anomaly ──────────────────────────────────────────────────
    // Store as a list — newest entry is at index 0 after LPUSH.
    const latKey = `latency:${endpoint}`
    await redis.lpush(latKey, responseTime)
    await redis.ltrim(latKey, 0, WINDOW_SIZE - 1)
    await redis.expire(latKey, 86400)

    const raw = await redis.lrange(latKey, 0, -1)
    const samples = raw.map(Number)

    if (samples.length >= MIN_SAMPLES) {
      const current = samples[0]          // the value we just pushed
      const history = samples.slice(1)    // all previous readings
      const baseline = history.reduce((a, b) => a + b, 0) / history.length

      if (baseline > 0 && current > ANOMALY_MULTIPLIER * baseline) {
        hints.push({
          code: 'LATENCY_ANOMALY',
          severity: 'warning',
          message: `Response time ${current}ms is ${(current / baseline).toFixed(1)}x the rolling average (${Math.round(baseline)}ms over ${history.length} previous requests to this endpoint).`,
        })
      }
    }

    // ── 2. Consecutive auth failures ───────────────────────────────────────
    const authKey = `auth_fails:${endpoint}`
    if (statusCode === 401) {
      const count = await redis.incr(authKey)
      await redis.expire(authKey, 3600)
      if (count >= AUTH_FAIL_THRESHOLD) {
        hints.push({
          code: 'CONSECUTIVE_AUTH_FAILURES',
          severity: 'warning',
          message: `${count} consecutive 401 responses on ${endpoint}. Your token may have expired or credentials are wrong.`,
        })
      }
    } else {
      // Any non-401 breaks the consecutive streak
      await redis.del(authKey)
    }

    // ── 3. Known error patterns ────────────────────────────────────────────
    const bodyStr = typeof responseBody === 'string'
      ? responseBody
      : JSON.stringify(responseBody)

    for (const { re, code, message } of KNOWN_PATTERNS) {
      if (re.test(bodyStr)) {
        hints.push({ code, severity: 'warning', message })
        break  // one pattern match per response is enough
      }
    }
  } catch (err) {
    // Redis unavailability must never crash the proxy — degrade silently.
    console.error('[Heuristics] Redis error:', (err as Error).message)
  }

  return hints
}
