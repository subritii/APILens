import { describe, it, expect, vi, beforeEach } from 'vitest'
import { promises as dnsPromises } from 'dns'
import { validateRequest } from './validate'

vi.mock('dns', () => ({
  promises: {
    lookup: vi.fn(),
  },
}))

const mockLookup = vi.mocked(dnsPromises.lookup) as ReturnType<typeof vi.fn>

describe('validateRequest', () => {
  beforeEach(() => {
    mockLookup.mockResolvedValue([])
  })

  describe('URL validation', () => {
    it('rejects an invalid URL', async () => {
      const issues = await validateRequest({ method: 'GET', url: 'not-a-url', headers: {} })
      expect(issues).toHaveLength(1)
      expect(issues[0].code).toBe('INVALID_URL')
      expect(issues[0].severity).toBe('error')
    })

    it('rejects an empty string URL', async () => {
      const issues = await validateRequest({ method: 'GET', url: '', headers: {} })
      expect(issues[0].code).toBe('INVALID_URL')
    })
  })

  describe('protocol validation', () => {
    it('rejects file:// protocol', async () => {
      const issues = await validateRequest({ method: 'GET', url: 'file:///etc/passwd', headers: {} })
      expect(issues[0].code).toBe('DISALLOWED_PROTOCOL')
      expect(issues[0].severity).toBe('error')
    })

    it('rejects ftp:// protocol', async () => {
      const issues = await validateRequest({ method: 'GET', url: 'ftp://example.com/file', headers: {} })
      expect(issues[0].code).toBe('DISALLOWED_PROTOCOL')
    })

    it('allows http://', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
      const issues = await validateRequest({ method: 'GET', url: 'http://example.com', headers: {} })
      expect(issues.find(i => i.code === 'DISALLOWED_PROTOCOL')).toBeUndefined()
    })

    it('allows https://', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
      const issues = await validateRequest({ method: 'GET', url: 'https://example.com', headers: {} })
      expect(issues.find(i => i.code === 'DISALLOWED_PROTOCOL')).toBeUndefined()
    })
  })

  describe('SSRF protection', () => {
    it('blocks loopback 127.0.0.1', async () => {
      mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
      const issues = await validateRequest({ method: 'GET', url: 'http://internal.host', headers: {} })
      expect(issues[0].code).toBe('SSRF_BLOCKED')
      expect(issues[0].severity).toBe('error')
    })

    it('blocks RFC1918 10.x.x.x', async () => {
      mockLookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }])
      const issues = await validateRequest({ method: 'GET', url: 'http://internal.host', headers: {} })
      expect(issues[0].code).toBe('SSRF_BLOCKED')
    })

    it('blocks RFC1918 172.16.x.x', async () => {
      mockLookup.mockResolvedValue([{ address: '172.16.0.1', family: 4 }])
      const issues = await validateRequest({ method: 'GET', url: 'http://internal.host', headers: {} })
      expect(issues[0].code).toBe('SSRF_BLOCKED')
    })

    it('blocks RFC1918 192.168.x.x', async () => {
      mockLookup.mockResolvedValue([{ address: '192.168.1.100', family: 4 }])
      const issues = await validateRequest({ method: 'GET', url: 'http://internal.host', headers: {} })
      expect(issues[0].code).toBe('SSRF_BLOCKED')
    })

    it('blocks CGNAT 100.64.x.x', async () => {
      mockLookup.mockResolvedValue([{ address: '100.64.0.1', family: 4 }])
      const issues = await validateRequest({ method: 'GET', url: 'http://internal.host', headers: {} })
      expect(issues[0].code).toBe('SSRF_BLOCKED')
    })

    it('blocks link-local 169.254.x.x', async () => {
      mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }])
      const issues = await validateRequest({ method: 'GET', url: 'http://metadata.host', headers: {} })
      expect(issues[0].code).toBe('SSRF_BLOCKED')
    })

    it('blocks IPv6 loopback ::1', async () => {
      mockLookup.mockResolvedValue([{ address: '::1', family: 6 }])
      const issues = await validateRequest({ method: 'GET', url: 'http://internal.host', headers: {} })
      expect(issues[0].code).toBe('SSRF_BLOCKED')
    })

    it('blocks IPv6 unique-local fc::/7', async () => {
      mockLookup.mockResolvedValue([{ address: 'fc00::1', family: 6 }])
      const issues = await validateRequest({ method: 'GET', url: 'http://internal.host', headers: {} })
      expect(issues[0].code).toBe('SSRF_BLOCKED')
    })

    it('allows a public IP', async () => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
      const issues = await validateRequest({ method: 'GET', url: 'https://example.com', headers: {} })
      expect(issues.find(i => i.code === 'SSRF_BLOCKED')).toBeUndefined()
    })

    it('allows when DNS resolves to nothing', async () => {
      mockLookup.mockResolvedValue([])
      const issues = await validateRequest({ method: 'GET', url: 'https://example.com', headers: {} })
      expect(issues.find(i => i.code === 'SSRF_BLOCKED')).toBeUndefined()
    })

    it('halts after the first blocking issue — does not add Content-Type warning', async () => {
      mockLookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }])
      const issues = await validateRequest({
        method: 'POST',
        url: 'http://internal.host',
        headers: {},
        body: { data: 1 },
      })
      expect(issues).toHaveLength(1)
      expect(issues[0].code).toBe('SSRF_BLOCKED')
    })
  })

  describe('Content-Type validation', () => {
    beforeEach(() => {
      mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    })

    it('warns when POST has a body but no Content-Type', async () => {
      const issues = await validateRequest({
        method: 'POST',
        url: 'https://example.com/api',
        headers: {},
        body: { name: 'test' },
      })
      expect(issues.some(i => i.code === 'MISSING_CONTENT_TYPE')).toBe(true)
      expect(issues.find(i => i.code === 'MISSING_CONTENT_TYPE')?.severity).toBe('warning')
    })

    it('does not warn when POST has body with Content-Type', async () => {
      const issues = await validateRequest({
        method: 'POST',
        url: 'https://example.com/api',
        headers: { 'content-type': 'application/json' },
        body: { name: 'test' },
      })
      expect(issues.find(i => i.code === 'MISSING_CONTENT_TYPE')).toBeUndefined()
    })

    it('is case-insensitive for the Content-Type header key', async () => {
      const issues = await validateRequest({
        method: 'PUT',
        url: 'https://example.com/api',
        headers: { 'Content-Type': 'application/json' },
        body: { foo: 'bar' },
      })
      expect(issues.find(i => i.code === 'MISSING_CONTENT_TYPE')).toBeUndefined()
    })

    it('does not warn for GET with a body — GET body is ignored', async () => {
      const issues = await validateRequest({
        method: 'GET',
        url: 'https://example.com/api',
        headers: {},
        body: { name: 'test' },
      })
      expect(issues.find(i => i.code === 'MISSING_CONTENT_TYPE')).toBeUndefined()
    })

    it('does not warn for HEAD with a body', async () => {
      const issues = await validateRequest({
        method: 'HEAD',
        url: 'https://example.com/api',
        headers: {},
        body: { name: 'test' },
      })
      expect(issues.find(i => i.code === 'MISSING_CONTENT_TYPE')).toBeUndefined()
    })
  })
})
