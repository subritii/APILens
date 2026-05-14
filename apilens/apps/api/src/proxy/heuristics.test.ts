import { describe, it, expect, vi, beforeEach } from 'vitest'
import { recordAndAnalyze } from './heuristics'

const mockRedis = vi.hoisted(() => ({
  lpush: vi.fn(),
  ltrim: vi.fn(),
  expire: vi.fn(),
  lrange: vi.fn(),
  incr: vi.fn(),
  del: vi.fn(),
}))

vi.mock('../redis', () => ({ redis: mockRedis }))

const URL = 'https://api.example.com/users'

describe('recordAndAnalyze', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRedis.lpush.mockResolvedValue(1)
    mockRedis.ltrim.mockResolvedValue('OK')
    mockRedis.expire.mockResolvedValue(1)
    mockRedis.lrange.mockResolvedValue([])
    mockRedis.incr.mockResolvedValue(1)
    mockRedis.del.mockResolvedValue(1)
  })

  describe('latency anomaly detection', () => {
    it('does not flag when fewer than 5 total samples exist', async () => {
      mockRedis.lrange.mockResolvedValue(['500', '100', '100'])
      const issues = await recordAndAnalyze('GET', URL, 200, 500, null)
      expect(issues.find(i => i.code === 'LATENCY_ANOMALY')).toBeUndefined()
    })

    it('flags when current response is more than 2x the historical average', async () => {
      // current=500ms, history=5x100ms → avg 100ms, 500 > 2×100
      mockRedis.lrange.mockResolvedValue(['500', '100', '100', '100', '100', '100'])
      const issues = await recordAndAnalyze('GET', URL, 200, 500, null)
      expect(issues.some(i => i.code === 'LATENCY_ANOMALY')).toBe(true)
    })

    it('does not flag when current is within 2x the average', async () => {
      // current=190ms, history=5x100ms → avg 100ms, 190 < 2×100
      mockRedis.lrange.mockResolvedValue(['190', '100', '100', '100', '100', '100'])
      const issues = await recordAndAnalyze('GET', URL, 200, 190, null)
      expect(issues.find(i => i.code === 'LATENCY_ANOMALY')).toBeUndefined()
    })

    it('includes the multiplier in the message', async () => {
      // current=600ms, history avg=100ms → 6.0x
      mockRedis.lrange.mockResolvedValue(['600', '100', '100', '100', '100', '100'])
      const issues = await recordAndAnalyze('GET', URL, 200, 600, null)
      expect(issues.find(i => i.code === 'LATENCY_ANOMALY')?.message).toMatch(/6\.0x/)
    })

    it('normalizes URL — strips query params for the latency key', async () => {
      mockRedis.lrange.mockResolvedValue([])
      await recordAndAnalyze('GET', 'https://api.example.com/users?page=1', 200, 100, null)
      await recordAndAnalyze('GET', 'https://api.example.com/users?page=2', 200, 100, null)
      const calls = mockRedis.lpush.mock.calls
      expect(calls[0][0]).toBe(calls[1][0])
    })
  })

  describe('consecutive auth failures', () => {
    it('does not flag on 1 consecutive 401', async () => {
      mockRedis.incr.mockResolvedValue(1)
      const issues = await recordAndAnalyze('GET', URL, 401, 100, null)
      expect(issues.find(i => i.code === 'CONSECUTIVE_AUTH_FAILURES')).toBeUndefined()
    })

    it('does not flag on 2 consecutive 401s', async () => {
      mockRedis.incr.mockResolvedValue(2)
      const issues = await recordAndAnalyze('GET', URL, 401, 100, null)
      expect(issues.find(i => i.code === 'CONSECUTIVE_AUTH_FAILURES')).toBeUndefined()
    })

    it('flags on 3 consecutive 401s', async () => {
      mockRedis.incr.mockResolvedValue(3)
      const issues = await recordAndAnalyze('GET', URL, 401, 100, null)
      expect(issues.some(i => i.code === 'CONSECUTIVE_AUTH_FAILURES')).toBe(true)
    })

    it('flags on 4+ consecutive 401s', async () => {
      mockRedis.incr.mockResolvedValue(7)
      const issues = await recordAndAnalyze('GET', URL, 401, 100, null)
      expect(issues.some(i => i.code === 'CONSECUTIVE_AUTH_FAILURES')).toBe(true)
    })

    it('resets the counter on a non-401 response', async () => {
      await recordAndAnalyze('GET', URL, 200, 100, null)
      expect(mockRedis.del).toHaveBeenCalled()
      expect(mockRedis.incr).not.toHaveBeenCalled()
    })

    it('does not reset on a 401', async () => {
      mockRedis.incr.mockResolvedValue(1)
      await recordAndAnalyze('GET', URL, 401, 100, null)
      expect(mockRedis.del).not.toHaveBeenCalled()
    })
  })

  describe('known error patterns', () => {
    it('detects an invalid API key', async () => {
      const issues = await recordAndAnalyze('GET', URL, 401, 100, { error: 'invalid api key provided' })
      expect(issues.some(i => i.code === 'AUTH_BAD_KEY')).toBe(true)
    })

    it('detects rate limiting', async () => {
      const issues = await recordAndAnalyze('GET', URL, 429, 100, { message: 'rate-limited, slow down' })
      expect(issues.some(i => i.code === 'RATE_LIMITED')).toBe(true)
    })

    it('detects "too many requests" as rate limiting', async () => {
      const issues = await recordAndAnalyze('GET', URL, 429, 100, 'Too many requests')
      expect(issues.some(i => i.code === 'RATE_LIMITED')).toBe(true)
    })

    it('detects an expired token', async () => {
      const issues = await recordAndAnalyze('GET', URL, 401, 100, { error: 'jwt expired' })
      expect(issues.some(i => i.code === 'TOKEN_EXPIRED')).toBe(true)
    })

    it('detects token expired in different phrasing', async () => {
      const issues = await recordAndAnalyze('GET', URL, 401, 100, 'token expired, please re-authenticate')
      expect(issues.some(i => i.code === 'TOKEN_EXPIRED')).toBe(true)
    })

    it('detects connection refused', async () => {
      const issues = await recordAndAnalyze('GET', URL, 503, 100, 'connect ECONNREFUSED 127.0.0.1:3000')
      expect(issues.some(i => i.code === 'CONN_REFUSED')).toBe(true)
    })

    it('returns no pattern issues for a clean 200', async () => {
      const issues = await recordAndAnalyze('GET', URL, 200, 100, { data: [1, 2, 3] })
      const patternCodes = ['AUTH_BAD_KEY', 'RATE_LIMITED', 'TOKEN_EXPIRED', 'CONN_REFUSED']
      expect(issues.filter(i => patternCodes.includes(i.code))).toHaveLength(0)
    })

    it('matches at most one pattern per response', async () => {
      // Body contains both a rate-limit phrase and a connection refused phrase
      const issues = await recordAndAnalyze('GET', URL, 429, 100, 'rate-limited ECONNREFUSED')
      const patternCodes = ['AUTH_BAD_KEY', 'RATE_LIMITED', 'TOKEN_EXPIRED', 'CONN_REFUSED']
      expect(issues.filter(i => patternCodes.includes(i.code))).toHaveLength(1)
    })
  })

  describe('Redis failure resilience', () => {
    it('returns an empty array when Redis throws — proxy must not crash', async () => {
      mockRedis.lpush.mockRejectedValue(new Error('Redis connection refused'))
      const issues = await recordAndAnalyze('GET', URL, 200, 100, null)
      expect(issues).toEqual([])
    })
  })
})
