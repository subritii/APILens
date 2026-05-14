import SwaggerParser from '@apidevtools/swagger-parser'
import type { OpenAPI } from 'openapi-types'
import crypto from 'crypto'

export interface LoadedSpec {
  key: string
  title: string
  version: string
  pathCount: number
  doc: OpenAPI.Document
}

// In-memory cache keyed by URL and by hash key.
// Cleared on server restart — acceptable for a dev tool.
const cache = new Map<string, LoadedSpec>()

export async function loadSpecFromUrl(url: string): Promise<LoadedSpec> {
  if (cache.has(url)) return cache.get(url)!

  // validate() fetches, parses, validates the spec, and resolves all $ref pointers.
  const doc = await SwaggerParser.validate(url, {
    dereference: { circular: 'ignore' },
  }) as OpenAPI.Document

  const key = crypto.createHash('sha256').update(url).digest('hex').slice(0, 12)
  const title = doc.info?.title ?? 'Unnamed Spec'
  const version = doc.info?.version ?? '?'
  const pathCount = Object.keys((doc as Record<string, unknown> & { paths?: object }).paths ?? {}).length

  const loaded: LoadedSpec = { key, title, version, pathCount, doc }
  cache.set(url, loaded)
  cache.set(key, loaded)

  return loaded
}

export function getSpec(key: string): LoadedSpec | undefined {
  return cache.get(key)
}
