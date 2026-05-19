'use client'

import { useState } from 'react'
import { PipelineResult } from '@/components/pipeline-result'
import type { Collection, SavedRequest } from '@/hooks/use-collections'
import type { Environment } from '@/hooks/use-environments'

function interpolate(str: string, env: Environment | null): string {
  if (!env) return str
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const found = env.variables.find(v => v.key === key)
    return found ? found.value : match
  })
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

const HEADER_NAMES = [
  'Accept', 'Authorization', 'Cache-Control', 'Content-Length', 'Content-Type',
  'X-API-Key', 'X-API-Version', 'X-Correlation-ID', 'X-Request-ID',
]

const HEADER_VALUE_SUGGESTIONS: Record<string, string[]> = {
  'Content-Type': ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'],
  'Accept': ['application/json', '*/*'],
  'Authorization': ['Bearer ', 'Basic '],
}

type DropState = { i: number; items: string[]; hl: number } | null

function DropdownList({ items, hl, onSelect, onHighlight }: {
  items: string[]
  hl: number
  onSelect: (v: string) => void
  onHighlight: (idx: number) => void
}) {
  return (
    <div className="absolute left-0 top-full z-50 mt-0.5 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900" style={{ maxHeight: 180 }}>
      {items.length === 0 ? (
        <div className="px-3 py-1.5 text-xs text-zinc-400">No matches</div>
      ) : items.map((item, idx) => (
        <div
          key={item}
          onMouseDown={e => { e.preventDefault(); onSelect(item) }}
          onMouseEnter={() => onHighlight(idx)}
          className={`cursor-pointer px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 ${hl === idx ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
        >
          {item}
        </div>
      ))}
    </div>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

export interface ValidationIssue {
  code: string
  severity: 'error' | 'warning'
  message: string
}

export interface AIExplanation {
  explanation: string
  fixSuggestion: string
  source: 'cache' | 'ai'
}

export interface ProxyResult {
  statusCode: number
  headers: Record<string, string>
  body: unknown
  responseTime: number
  layer1Flags: ValidationIssue[]
  layer2Flags: ValidationIssue[]
  historyId: string | null
  aiExplanation: AIExplanation | null
  autoInjectedContentType: boolean
  blocked?: boolean
  bodyFormat?: 'json' | 'form' | 'multipart' | 'none'
}

interface HeaderRow { key: string; value: string; enabled?: boolean }
type AuthType = 'none' | 'bearer' | 'basic' | 'apikey'
type RequestTab = 'headers' | 'auth' | 'body'

interface Props {
  initialMethod?: string
  initialUrl?: string
  initialHeaders?: HeaderRow[]
  initialBody?: string
  collections: Collection[]
  onSave: (collectionId: string, req: Omit<SavedRequest, 'id'>) => void
  activeEnv?: Environment | null
  activeSpecKey?: string | null
}

export function RequestBuilder({
  initialMethod = 'GET',
  initialUrl = '',
  initialHeaders = [{ key: '', value: '' }],
  initialBody = '',
  collections,
  onSave,
  activeEnv = null,
  activeSpecKey = null,
}: Props) {
  const [method, setMethod] = useState(initialMethod)
  const [url, setUrl] = useState(initialUrl)
  const [headers, setHeaders] = useState<HeaderRow[]>([
    ...initialHeaders,
    ...(initialHeaders.length === 0 || initialHeaders[initialHeaders.length - 1].key !== ''
      ? [{ key: '', value: '' }]
      : []),
  ])
  const [body, setBody] = useState(initialBody)
  const [requestTab, setRequestTab] = useState<RequestTab>('headers')

  // Auth state
  const [authType, setAuthType] = useState<AuthType>('none')
  const [authToken, setAuthToken] = useState('')
  const [authUser, setAuthUser] = useState('')
  const [authPass, setAuthPass] = useState('')
  const [apiKeyHeader, setApiKeyHeader] = useState('X-API-Key')
  const [showToken, setShowToken] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const [keyDrop, setKeyDrop] = useState<DropState>(null)
  const [valDrop, setValDrop] = useState<DropState>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ProxyResult | null>(null)
  const [explaining, setExplaining] = useState(false)
  const [explainError, setExplainError] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveCollectionId, setSaveCollectionId] = useState('')

  const authConfigured = authType !== 'none' && (authToken.trim() || authUser.trim())

  function updateHeader(index: number, field: 'key' | 'value', val: string) {
    setHeaders(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: val }
      if (index === prev.length - 1 && val !== '') next.push({ key: '', value: '' })
      return next
    })
  }

  function removeHeader(index: number) {
    setHeaders(prev =>
      prev.length === 1 ? [{ key: '', value: '' }] : prev.filter((_, i) => i !== index)
    )
  }

  function toggleHeader(index: number) {
    setHeaders(prev => {
      const next = [...prev]
      next[index] = { ...next[index], enabled: next[index].enabled === false ? true : false }
      return next
    })
  }

  async function send() {
    if (!url.trim()) { setError('URL is required.'); return }

    const resolvedUrl = interpolate(url.trim(), activeEnv)

    // Build header map first — needed for Content-Type checks below.
    const headerMap: Record<string, string> = {}
    if (authType === 'bearer' && authToken.trim()) {
      headerMap['Authorization'] = `Bearer ${authToken.trim()}`
    } else if (authType === 'basic') {
      headerMap['Authorization'] = `Basic ${btoa(`${authUser}:${authPass}`)}`
    } else if (authType === 'apikey' && authToken.trim() && apiKeyHeader.trim()) {
      headerMap[apiKeyHeader.trim()] = authToken.trim()
    }
    for (const h of headers.filter(h => h.key.trim() && h.enabled !== false)) {
      headerMap[interpolate(h.key.trim(), activeEnv)] = interpolate(h.value.trim(), activeEnv)
    }

    // Clear previous result immediately so early returns never leave stale pipeline state visible.
    setError('')
    setResult(null)
    setExplainError('')

    const effectiveCt = (Object.entries(headerMap)
      .find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '').toLowerCase()
    const isFormBody = effectiveCt.includes('x-www-form-urlencoded') || effectiveCt.includes('multipart/form-data')

    const hasBodyMethod = !['GET', 'HEAD'].includes(method)
    const bodyFormat: ProxyResult['bodyFormat'] =
      !hasBodyMethod || !body.trim() ? 'none'
      : effectiveCt.includes('multipart') ? 'multipart'
      : effectiveCt.includes('x-www-form-urlencoded') ? 'form'
      : 'json'

    let parsedBody: unknown
    if (body.trim() && hasBodyMethod) {
      if (isFormBody) {
        // Form-encoded and multipart bodies are raw strings — no JSON parsing.
        parsedBody = body.trim()
      } else {
        // No CT or application/json → engine will auto-inject JSON, so validate now.
        try {
          parsedBody = JSON.parse(body)
        } catch {
          setResult({
            statusCode: 0, headers: {}, body: null, responseTime: 0,
            layer1Flags: [{ code: 'INVALID_JSON_BODY', severity: 'error', message: 'Request body is not valid JSON. Fix the syntax before sending.' }],
            layer2Flags: [], historyId: null, aiExplanation: null,
            autoInjectedContentType: false, blocked: true, bodyFormat: 'json',
          })
          return
        }
      }
    }

    const hasContentType = Object.keys(headerMap).some(k => k.toLowerCase() === 'content-type')
    const autoInjectedContentType = parsedBody !== undefined && !hasContentType

    setLoading(true)

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/proxy/request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, url: resolvedUrl, headers: headerMap, body: parsedBody, specKey: activeSpecKey }),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        if (data.layer1Flags) {
          setResult({ statusCode: res.status, headers: {}, body: null, responseTime: 0, layer1Flags: data.layer1Flags, layer2Flags: data.layer2Flags ?? [], historyId: null, aiExplanation: null, autoInjectedContentType: false, blocked: true })
        } else {
          setError(data.error ?? 'Request blocked by validation.')
        }
        return
      }
      setResult({ ...data, autoInjectedContentType, bodyFormat })
    } catch {
      setError('Could not reach the APILens backend. Is it running on port 4000?')
    } finally {
      setLoading(false)
    }
  }

  async function explain() {
    if (!result?.historyId) {
      setExplainError('AI explanation requires the database to be running. Start Docker and try again.')
      return
    }
    setExplaining(true)
    setExplainError('')
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/proxy/explain`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ historyId: result.historyId }),
        }
      )
      const data = await res.json()
      if (res.ok && data.aiExplanation) {
        setResult(prev => prev ? { ...prev, aiExplanation: data.aiExplanation } : prev)
      } else {
        setExplainError(data.error ?? 'AI explanation failed.')
      }
    } catch {
      setExplainError('Could not reach the APILens backend.')
    } finally {
      setExplaining(false)
    }
  }

  function submitSave(e: React.FormEvent) {
    e.preventDefault()
    if (!saveName.trim() || !saveCollectionId) return
    onSave(saveCollectionId, {
      name: saveName.trim(),
      method,
      url,
      headers: headers.filter(h => h.key.trim()),
      body,
    })
    setSaving(false)
    setSaveName('')
  }

  const hasVariables = /\{\{.+?\}\}/.test(url)
  const resolvedUrl = interpolate(url, activeEnv)
  const hasUnresolved = resolvedUrl.includes('{{')

  const inputCls = 'rounded border border-zinc-200 bg-transparent px-2 py-1 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:text-zinc-50'

  return (
    <div className="flex flex-col gap-4">

      {hasVariables && !activeEnv && (
        <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300">
          <span>⚠</span>
          <span>No environment selected — <code className="font-mono">{'{{variables}}'}</code> will not resolve. Select one in the header.</span>
        </div>
      )}

      {/* ── URL bar ── */}
      <div className="flex gap-2">
        <select
          value={method}
          onChange={e => setMethod(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="https://api.example.com/endpoint"
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />

        <button
          onClick={send}
          disabled={loading}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {loading ? 'Sending…' : 'Send'}
        </button>

        <button
          onClick={() => { setSaving(v => !v); setSaveCollectionId(collections[0]?.id ?? '') }}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-50 dark:hover:text-zinc-50"
        >
          Save
        </button>
      </div>

      {hasVariables && activeEnv && (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span>→</span>
          <span className={`font-mono ${hasUnresolved ? 'text-orange-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
            {resolvedUrl}
          </span>
          {hasUnresolved && <span className="text-orange-500">(some variables not found in environment)</span>}
        </div>
      )}

      {saving && (
        <form
          onSubmit={submitSave}
          className="flex gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <input
            autoFocus
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="Request name"
            className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
          {collections.length === 0 ? (
            <span className="self-center text-xs text-zinc-400">Create a collection first</span>
          ) : (
            <select
              value={saveCollectionId}
              onChange={e => setSaveCollectionId(e.target.value)}
              className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            >
              {collections.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <button
            type="submit"
            disabled={collections.length === 0}
            className="rounded bg-zinc-900 px-3 py-1 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
          >
            Save
          </button>
          <button type="button" onClick={() => setSaving(false)} className="text-xs text-zinc-400 hover:text-zinc-700 px-1">✕</button>
        </form>
      )}

      {/* ── Tabs ── */}
      <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
        <div className="flex border-b border-zinc-200 dark:border-zinc-800">
          {(['headers', 'auth', 'body'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setRequestTab(tab)}
              className={`relative px-4 py-2 text-sm font-medium capitalize transition-colors ${
                requestTab === tab
                  ? 'border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-50 dark:text-zinc-50'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50'
              }`}
            >
              {tab}
              {tab === 'auth' && authConfigured && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
              )}
            </button>
          ))}
        </div>

        <div className="p-4">

          {/* ── Headers tab ── */}
          {requestTab === 'headers' && (() => {
            const realRows = headers.slice(0, -1)
            const ghostRow = headers[headers.length - 1]
            const ghostIndex = headers.length - 1
            const showAutoCtRow = body.trim() !== '' && !['GET', 'HEAD'].includes(method)

            const renderRow = (row: HeaderRow, i: number) => {
              const showKeyDrop = keyDrop?.i === i
              const showValDrop = valDrop?.i === i

              return (
                <div key={i} className={`flex items-center gap-2 ${row.enabled === false ? 'opacity-40' : ''}`}>
                  <input
                    type="checkbox"
                    checked={row.enabled !== false}
                    onChange={() => toggleHeader(i)}
                    className="h-3.5 w-3.5 shrink-0 accent-zinc-700 dark:accent-zinc-300"
                  />

                  {/* Key input with filtering autocomplete */}
                  <div className="relative w-2/5">
                    <input
                      value={row.key}
                      placeholder="Header name"
                      className={`w-full ${inputCls}`}
                      onChange={e => {
                        updateHeader(i, 'key', e.target.value)
                        const q = e.target.value.toLowerCase()
                        const items = HEADER_NAMES.filter(n => q ? n.toLowerCase().startsWith(q) : true)
                        setKeyDrop({ i, items, hl: 0 })
                        setValDrop(null)
                      }}
                      onFocus={() => {
                        const q = row.key.toLowerCase()
                        const items = HEADER_NAMES.filter(n => q ? n.toLowerCase().startsWith(q) : true)
                        setKeyDrop({ i, items, hl: 0 })
                        setValDrop(null)
                      }}
                      onBlur={() => setKeyDrop(null)}
                      onKeyDown={e => {
                        if (!showKeyDrop) return
                        if (e.key === 'Escape') { e.preventDefault(); setKeyDrop(null) }
                        else if (e.key === 'ArrowDown') { e.preventDefault(); setKeyDrop(d => d ? { ...d, hl: Math.min(d.hl + 1, d.items.length - 1) } : d) }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); setKeyDrop(d => d ? { ...d, hl: Math.max(d.hl - 1, 0) } : d) }
                        else if (e.key === 'Enter' && keyDrop!.items.length > 0) {
                          e.preventDefault()
                          updateHeader(i, 'key', keyDrop!.items[keyDrop!.hl] ?? keyDrop!.items[0])
                          setKeyDrop(null)
                        }
                      }}
                    />
                    {showKeyDrop && (
                      <DropdownList
                        items={keyDrop!.items}
                        hl={keyDrop!.hl}
                        onSelect={val => { updateHeader(i, 'key', val); setKeyDrop(null) }}
                        onHighlight={hl => setKeyDrop(d => d ? { ...d, hl } : d)}
                      />
                    )}
                  </div>

                  {/* Value input with per-header suggestions */}
                  <div className="relative flex-1">
                    <input
                      value={row.value}
                      placeholder="Value"
                      className={`w-full ${inputCls}`}
                      onChange={e => {
                        updateHeader(i, 'value', e.target.value)
                        setValDrop(null)
                      }}
                      onFocus={() => {
                        const suggestions = HEADER_VALUE_SUGGESTIONS[row.key]
                        setKeyDrop(null)
                        if (suggestions) setValDrop({ i, items: suggestions, hl: 0 })
                      }}
                      onBlur={() => setValDrop(null)}
                      onKeyDown={e => {
                        if (!showValDrop) return
                        if (e.key === 'Escape') { e.preventDefault(); setValDrop(null) }
                        else if (e.key === 'ArrowDown') { e.preventDefault(); setValDrop(d => d ? { ...d, hl: Math.min(d.hl + 1, d.items.length - 1) } : d) }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); setValDrop(d => d ? { ...d, hl: Math.max(d.hl - 1, 0) } : d) }
                        else if (e.key === 'Enter' && valDrop!.items.length > 0) {
                          e.preventDefault()
                          updateHeader(i, 'value', valDrop!.items[valDrop!.hl] ?? valDrop!.items[0])
                          setValDrop(null)
                        }
                      }}
                    />
                    {showValDrop && (
                      <DropdownList
                        items={valDrop!.items}
                        hl={valDrop!.hl}
                        onSelect={val => { updateHeader(i, 'value', val); setValDrop(null) }}
                        onHighlight={hl => setValDrop(d => d ? { ...d, hl } : d)}
                      />
                    )}
                  </div>

                  <button onClick={() => removeHeader(i)} className="px-2 text-zinc-400 hover:text-red-500 transition-colors text-xs">✕</button>
                </div>
              )
            }

            return (
              <div className="flex flex-col gap-2">
                {/* Column labels */}
                <div className="flex items-center gap-2 pb-0.5">
                  <div className="h-3.5 w-3.5 shrink-0" />
                  <span className="w-2/5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">Header name</span>
                  <span className="flex-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">Value</span>
                  <div className="w-6 shrink-0" />
                </div>

                {realRows.map((row, i) => renderRow(row, i))}

                {(() => {
                  const noCtHeader = !headers.some(h => h.key.toLowerCase() === 'content-type' && h.key.trim())
                  const addCtHeader = () => setHeaders(prev => {
                    const withoutGhost = prev.slice(0, -1)
                    return [...withoutGhost, { key: 'Content-Type', value: 'application/json' }, { key: '', value: '' }]
                  })
                  if (result?.autoInjectedContentType && noCtHeader) {
                    return (
                      <div className="flex items-center gap-2 rounded border border-blue-200 bg-blue-50 px-2 py-1.5 dark:border-blue-900 dark:bg-blue-950">
                        <span className="flex-1 text-[10px] text-blue-700 dark:text-blue-300">
                          <code className="font-mono">Content-Type: application/json</code> was added automatically. Add it to your headers to make this permanent.
                        </span>
                        <button
                          type="button"
                          onMouseDown={e => { e.preventDefault(); addCtHeader() }}
                          className="shrink-0 rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700"
                        >
                          Add
                        </button>
                      </div>
                    )
                  }
                  if (showAutoCtRow && noCtHeader) {
                    return (
                      <div className="flex items-center gap-2 rounded border border-dashed border-amber-300 bg-amber-50 px-2 py-1 dark:border-amber-800 dark:bg-amber-950">
                        <span className="flex-1 text-[10px] text-amber-700 dark:text-amber-400">
                          No <code className="font-mono">Content-Type</code> set — servers may reject or misparse this body.
                        </span>
                        <button
                          type="button"
                          onMouseDown={e => { e.preventDefault(); addCtHeader() }}
                          className="shrink-0 rounded bg-amber-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-amber-700"
                        >
                          Add
                        </button>
                      </div>
                    )
                  }
                  return null
                })()}

                {renderRow(ghostRow, ghostIndex)}
              </div>
            )
          })()}

          {/* ── Auth tab ── */}
          {requestTab === 'auth' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs text-zinc-500">Auth type</span>
                <select
                  value={authType}
                  onChange={e => setAuthType(e.target.value as AuthType)}
                  className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:text-zinc-50"
                >
                  <option value="none">No Auth</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="basic">Basic Auth</option>
                  <option value="apikey">API Key</option>
                </select>
              </div>

              {authType === 'bearer' && (
                <div className="flex items-center gap-4">
                  <span className="w-28 shrink-0 text-xs text-zinc-500">Token</span>
                  <div className="relative flex-1">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={authToken}
                      onChange={e => setAuthToken(e.target.value)}
                      placeholder="your-token-here"
                      className={`w-full pr-8 ${inputCls}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      <EyeIcon open={showToken} />
                    </button>
                  </div>
                </div>
              )}

              {authType === 'basic' && (
                <>
                  <div className="flex items-center gap-4">
                    <span className="w-28 shrink-0 text-xs text-zinc-500">Username</span>
                    <input
                      value={authUser}
                      onChange={e => setAuthUser(e.target.value)}
                      placeholder="username"
                      className={`flex-1 ${inputCls}`}
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="w-28 shrink-0 text-xs text-zinc-500">Password</span>
                    <div className="relative flex-1">
                      <input
                        type={showPass ? 'text' : 'password'}
                        value={authPass}
                        onChange={e => setAuthPass(e.target.value)}
                        placeholder="password"
                        className={`w-full pr-8 ${inputCls}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(v => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                      >
                        <EyeIcon open={showPass} />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {authType === 'apikey' && (
                <>
                  <div className="flex items-center gap-4">
                    <span className="w-28 shrink-0 text-xs text-zinc-500">Header name</span>
                    <input
                      value={apiKeyHeader}
                      onChange={e => setApiKeyHeader(e.target.value)}
                      placeholder="X-API-Key"
                      className={`flex-1 ${inputCls}`}
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="w-28 shrink-0 text-xs text-zinc-500">Value</span>
                    <div className="relative flex-1">
                      <input
                        type={showToken ? 'text' : 'password'}
                        value={authToken}
                        onChange={e => setAuthToken(e.target.value)}
                        placeholder="your-api-key"
                        className={`w-full pr-8 ${inputCls}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(v => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                      >
                        <EyeIcon open={showToken} />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {authType !== 'none' && (
                <p className="text-xs text-zinc-400">
                  Added as an <code className="font-mono text-zinc-600 dark:text-zinc-300">Authorization</code> header automatically when you send.
                </p>
              )}
            </div>
          )}

          {/* ── Body tab ── */}
          {requestTab === 'body' && (
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={'{\n  "key": "value"\n}'}
              rows={6}
              className={`w-full ${inputCls}`}
            />
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {result && <PipelineResult result={result} onExplain={explain} explaining={explaining} explainError={explainError} />}
    </div>
  )
}
