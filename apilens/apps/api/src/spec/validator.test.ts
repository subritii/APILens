import { describe, it, expect } from 'vitest'
import { validateRequestAgainstSpec, validateResponseAgainstSpec } from './validator'
import type { OpenAPIV3 } from 'openapi-types'

function makeDoc(overrides: Partial<OpenAPIV3.Document> = {}): OpenAPIV3.Document {
  return {
    openapi: '3.0.0',
    info: { title: 'Test', version: '1.0.0' },
    paths: {
      '/users': {
        post: {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    age: { type: 'integer' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['id'],
                    properties: {
                      id: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/users/{id}': {
        get: {
          responses: { '200': { description: 'OK' } },
        },
      },
    },
    ...overrides,
  }
}

const BASE = 'https://api.example.com'

describe('validateRequestAgainstSpec', () => {
  it('passes a valid request body', () => {
    const issues = validateRequestAgainstSpec(makeDoc(), 'POST', `${BASE}/users`, { name: 'Alice' })
    expect(issues.filter(i => i.code === 'SPEC_REQUEST_INVALID')).toHaveLength(0)
  })

  it('passes when body has extra optional fields', () => {
    const issues = validateRequestAgainstSpec(makeDoc(), 'POST', `${BASE}/users`, { name: 'Alice', age: 30 })
    expect(issues.filter(i => i.code === 'SPEC_REQUEST_INVALID')).toHaveLength(0)
  })

  it('fails when a required field is missing', () => {
    const issues = validateRequestAgainstSpec(makeDoc(), 'POST', `${BASE}/users`, { age: 30 })
    expect(issues.some(i => i.code === 'SPEC_REQUEST_INVALID')).toBe(true)
  })

  it('fails when a field has the wrong type', () => {
    const issues = validateRequestAgainstSpec(makeDoc(), 'POST', `${BASE}/users`, { name: 42 })
    expect(issues.some(i => i.code === 'SPEC_REQUEST_INVALID')).toBe(true)
  })

  it('fails when the integer field receives a string', () => {
    const issues = validateRequestAgainstSpec(makeDoc(), 'POST', `${BASE}/users`, { name: 'Alice', age: 'thirty' })
    expect(issues.some(i => i.code === 'SPEC_REQUEST_INVALID')).toBe(true)
  })

  it('warns when the endpoint is not defined in the spec', () => {
    const issues = validateRequestAgainstSpec(makeDoc(), 'GET', `${BASE}/unknown`, null)
    expect(issues.some(i => i.code === 'SPEC_ENDPOINT_NOT_FOUND')).toBe(true)
    expect(issues.find(i => i.code === 'SPEC_ENDPOINT_NOT_FOUND')?.severity).toBe('warning')
  })

  describe('path parameter matching', () => {
    it('matches /users/{id} with a string ID', () => {
      const issues = validateRequestAgainstSpec(makeDoc(), 'GET', `${BASE}/users/abc`, null)
      expect(issues.find(i => i.code === 'SPEC_ENDPOINT_NOT_FOUND')).toBeUndefined()
    })

    it('matches /users/{id} with a numeric ID', () => {
      const issues = validateRequestAgainstSpec(makeDoc(), 'GET', `${BASE}/users/12345`, null)
      expect(issues.find(i => i.code === 'SPEC_ENDPOINT_NOT_FOUND')).toBeUndefined()
    })

    it('does not match a path that has too many segments', () => {
      const issues = validateRequestAgainstSpec(makeDoc(), 'GET', `${BASE}/users/123/extra`, null)
      expect(issues.some(i => i.code === 'SPEC_ENDPOINT_NOT_FOUND')).toBe(true)
    })
  })

  describe('server base path stripping', () => {
    it('strips the server base path before matching', () => {
      const doc = makeDoc({
        servers: [{ url: 'https://api.example.com/v2' }],
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['name'],
                      properties: { name: { type: 'string' } },
                    },
                  },
                },
              },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      })
      const issues = validateRequestAgainstSpec(doc, 'POST', `${BASE}/v2/users`, { name: 'Bob' })
      expect(issues.find(i => i.code === 'SPEC_ENDPOINT_NOT_FOUND')).toBeUndefined()
      expect(issues.filter(i => i.code === 'SPEC_REQUEST_INVALID')).toHaveLength(0)
    })
  })
})

describe('validateResponseAgainstSpec', () => {
  it('passes a valid response body', () => {
    const issues = validateResponseAgainstSpec(makeDoc(), 'POST', `${BASE}/users`, 200, { id: 'user_123' })
    expect(issues.filter(i => i.code === 'SPEC_RESPONSE_INVALID')).toHaveLength(0)
  })

  it('flags a missing required field in the response', () => {
    const issues = validateResponseAgainstSpec(makeDoc(), 'POST', `${BASE}/users`, 200, {})
    expect(issues.some(i => i.code === 'SPEC_RESPONSE_INVALID')).toBe(true)
    expect(issues.find(i => i.code === 'SPEC_RESPONSE_INVALID')?.severity).toBe('warning')
  })

  it('returns no issues when the endpoint is not in the spec', () => {
    const issues = validateResponseAgainstSpec(makeDoc(), 'DELETE', `${BASE}/unknown`, 200, {})
    expect(issues).toHaveLength(0)
  })

  it('returns no issues when the status code has no spec entry', () => {
    const issues = validateResponseAgainstSpec(makeDoc(), 'POST', `${BASE}/users`, 500, { error: 'internal' })
    expect(issues).toHaveLength(0)
  })

  it('skips validation when the body is a plain string', () => {
    const issues = validateResponseAgainstSpec(makeDoc(), 'POST', `${BASE}/users`, 200, 'plain text')
    expect(issues).toHaveLength(0)
  })
})

describe('nullable field handling (OpenAPI 3.0 → JSON Schema)', () => {
  const nullableDoc = (): OpenAPIV3.Document => ({
    openapi: '3.0.0',
    info: { title: 'Test', version: '1.0.0' },
    paths: {
      '/items': {
        post: {
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    note: { type: 'string', nullable: true } as OpenAPIV3.SchemaObject,
                    title: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  })

  it('accepts null for a nullable field', () => {
    const issues = validateRequestAgainstSpec(nullableDoc(), 'POST', `${BASE}/items`, { note: null })
    expect(issues.filter(i => i.code === 'SPEC_REQUEST_INVALID')).toHaveLength(0)
  })

  it('accepts a string value for a nullable field', () => {
    const issues = validateRequestAgainstSpec(nullableDoc(), 'POST', `${BASE}/items`, { note: 'hello' })
    expect(issues.filter(i => i.code === 'SPEC_REQUEST_INVALID')).toHaveLength(0)
  })

  it('rejects null for a non-nullable string field', () => {
    const issues = validateRequestAgainstSpec(nullableDoc(), 'POST', `${BASE}/items`, { title: null })
    expect(issues.some(i => i.code === 'SPEC_REQUEST_INVALID')).toBe(true)
  })
})
