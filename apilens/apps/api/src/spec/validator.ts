import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import type { OpenAPI, OpenAPIV3 } from 'openapi-types'
import type { ValidationIssue } from '../proxy/validate'

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)
for (const kw of ['discriminator', 'readOnly', 'writeOnly', 'xml', 'externalDocs', 'example']) {
  try { ajv.addKeyword(kw) } catch { /* already registered */ }
}

// OpenAPI 3.0 uses `nullable: true` which isn't valid JSON Schema.
// Convert it to a proper null union before handing to AJV.
// e.g. { type: 'string', nullable: true } → { type: ['string', 'null'] }
//      { nullable: true }                 → { type: 'null' }
function toJsonSchema(schema: unknown): unknown {
  if (typeof schema !== 'object' || schema === null) return schema
  if (Array.isArray(schema)) return schema.map(toJsonSchema)

  const s = { ...(schema as Record<string, unknown>) }

  if (s['nullable'] === true) {
    if (typeof s['type'] === 'string') {
      s['type'] = [s['type'], 'null']
    } else if (!s['type']) {
      s['type'] = 'null'
    }
    delete s['nullable']
  }

  for (const key of Object.keys(s)) {
    s[key] = toJsonSchema(s[key])
  }
  return s
}

// Convert "/users/{id}/posts/{postId}" → regex that matches "/users/123/posts/456"
function pathToRegex(template: string): RegExp {
  const pattern = template
    .replace(/\//g, '\\/')
    .replace(/\{[^}]+\}/g, '[^\\/]+')
  return new RegExp(`^${pattern}$`)
}

function findOperation(doc: OpenAPI.Document, method: string, pathname: string) {
  const paths = (doc as OpenAPIV3.Document).paths ?? {}

  for (const [template, pathItem] of Object.entries(paths)) {
    if (!pathItem) continue
    if (!pathToRegex(template).test(pathname)) continue
    const operation = (pathItem as Record<string, unknown>)[method.toLowerCase()]
    if (operation) return operation as OpenAPIV3.OperationObject
  }

  return null
}

function runAjv(schema: unknown, data: unknown): string[] {
  try {
    const validate = ajv.compile(toJsonSchema(schema) as object)
    if (validate(data)) return []
    return (validate.errors ?? []).map(e =>
      `${e.instancePath || '(root)'} ${e.message}`
    )
  } catch {
    return []
  }
}

// Strip the server base path so "/api/v3/pet" becomes "/pet" before matching spec paths.
function resolvePathname(doc: OpenAPI.Document, requestUrl: string): string {
  let pathname: string
  try { pathname = new URL(requestUrl).pathname } catch { return requestUrl }

  const servers = (doc as OpenAPIV3.Document).servers ?? []
  for (const server of servers) {
    try {
      const basePath = new URL(server.url).pathname.replace(/\/$/, '')
      if (basePath && pathname.startsWith(basePath)) {
        return pathname.slice(basePath.length) || '/'
      }
    } catch { /* server URL may be a relative path — skip */ }
  }
  return pathname
}

export function validateRequestAgainstSpec(
  doc: OpenAPI.Document,
  method: string,
  url: string,
  body: unknown,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  const pathname = resolvePathname(doc, url)

  const operation = findOperation(doc, method, pathname)
  if (!operation) {
    issues.push({
      code: 'SPEC_ENDPOINT_NOT_FOUND',
      severity: 'warning',
      message: `${method.toUpperCase()} ${pathname} is not defined in the loaded spec.`,
    })
    return issues
  }

  const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject | undefined
  const content = requestBody?.content ?? {}
  // Try JSON first, then form-encoded (Stripe uses application/x-www-form-urlencoded)
  const schema = content['application/json']?.schema
    ?? content['application/x-www-form-urlencoded']?.schema

  if (schema && body !== undefined) {
    const errors = runAjv(schema, body)
    for (const msg of errors) {
      issues.push({ code: 'SPEC_REQUEST_INVALID', severity: 'error', message: `Request body — ${msg}.` })
    }
  }

  return issues
}

export function validateResponseAgainstSpec(
  doc: OpenAPI.Document,
  method: string,
  url: string,
  statusCode: number,
  body: unknown,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  const pathname = resolvePathname(doc, url)

  const operation = findOperation(doc, method, pathname)
  if (!operation) return issues

  const responses = (operation.responses ?? {}) as Record<string, OpenAPIV3.ResponseObject>
  const responseSpec = responses[String(statusCode)] ?? responses['default']
  if (!responseSpec) return issues

  const schema = responseSpec.content?.['application/json']?.schema
  if (schema && body !== undefined && typeof body !== 'string') {
    const errors = runAjv(schema, body)
    for (const msg of errors) {
      issues.push({
        code: 'SPEC_RESPONSE_INVALID',
        severity: 'warning',
        message: `Response body — ${msg} (spec expects this for ${statusCode}).`,
      })
    }
  }

  return issues
}
