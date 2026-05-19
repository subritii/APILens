'use client'

import { useState } from 'react'
import { JsonBody } from '@/components/response-viewer'
import type { ProxyResult, AIExplanation, ValidationIssue } from '@/components/request-builder'

// ── Icons ─────────────────────────────────────────────────────────────────────

function ShieldIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function RadarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </svg>
  )
}

function SparklesIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.88 5.76H20l-4.94 3.59 1.88 5.76L12 14.52l-4.94 3.59 1.88-5.76L4 8.76h6.12z" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 text-zinc-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

type LayerStatus = 'pass' | 'warning' | 'blocked' | 'skipped'

const L1_RULES: Array<{ id: string; label: string; codes: string[] }> = [
  { id: 'url',    label: 'URL & protocol',  codes: ['INVALID_URL', 'DISALLOWED_PROTOCOL'] },
  { id: 'ssrf',   label: 'SSRF protection', codes: ['SSRF_BLOCKED'] },
  { id: 'ct',     label: 'Content-Type',    codes: ['CONTENT_TYPE_MISMATCH'] },
  { id: 'json',   label: 'JSON body',       codes: ['INVALID_JSON_BODY'] },
  { id: 'schema', label: 'OpenAPI schema',  codes: [] },
]

const KNOWN_L1_CODES = new Set([
  'INVALID_URL', 'DISALLOWED_PROTOCOL', 'SSRF_BLOCKED',
  'CONTENT_TYPE_MISMATCH', 'INVALID_JSON_BODY',
])

// ── Status helpers ────────────────────────────────────────────────────────────

function l1Status(flags: ValidationIssue[], blocked: boolean): LayerStatus {
  if (blocked || flags.some(f => f.severity === 'error')) return 'blocked'
  if (flags.some(f => f.severity === 'warning')) return 'warning'
  return 'pass'
}

function l2Status(flags: ValidationIssue[], requestBlocked: boolean): LayerStatus {
  if (requestBlocked) return 'skipped'
  if (flags.length > 0) return 'warning'
  return 'pass'
}

function l3Status(isError: boolean, ai: AIExplanation | null, requestBlocked: boolean): LayerStatus {
  if (requestBlocked) return 'skipped'
  if (ai) return isError ? 'warning' : 'pass'
  return 'skipped'
}

// ── L1 rule state computation ─────────────────────────────────────────────────

type RuleState = 'pass' | 'fail' | 'skip'

function getL1RuleStates(flags: ValidationIssue[], bodyFormat: ProxyResult['bodyFormat']): Map<string, { state: RuleState; flags: ValidationIssue[] }> {
  const codeSet = new Set(flags.map(f => f.code))
  const urlFailed = codeSet.has('INVALID_URL') || codeSet.has('DISALLOWED_PROTOCOL')
  const ssrfFailed = codeSet.has('SSRF_BLOCKED')
  const jsonNotApplicable = bodyFormat === 'form' || bodyFormat === 'multipart' || bodyFormat === 'none'
  const out = new Map<string, { state: RuleState; flags: ValidationIssue[] }>()

  for (const rule of L1_RULES) {
    const matched = rule.codes.length > 0
      ? flags.filter(f => rule.codes.includes(f.code))
      : flags.filter(f => !KNOWN_L1_CODES.has(f.code))

    let state: RuleState
    if (matched.length > 0) {
      state = 'fail'
    } else if (urlFailed && rule.id !== 'url') {
      state = 'skip'
    } else if (ssrfFailed && !['url', 'ssrf'].includes(rule.id)) {
      state = 'skip'
    } else if (rule.id === 'json' && jsonNotApplicable) {
      state = 'skip'
    } else {
      state = 'pass'
    }

    out.set(rule.id, { state, flags: matched })
  }

  return out
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<LayerStatus, { label: string; cls: string }> = {
  pass:    { label: 'Pass',    cls: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' },
  warning: { label: 'Warning', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' },
  blocked: { label: 'Blocked', cls: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' },
  skipped: { label: 'Skipped', cls: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' },
}

function StatusBadge({ status }: { status: LayerStatus }) {
  const { label, cls } = STATUS_STYLES[status]
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {label}
    </span>
  )
}

// ── LayerCard — base collapsible card ─────────────────────────────────────────

function LayerCard({ pill, name, icon, status, accentColor, children }: {
  pill: string
  name: string
  icon: React.ReactNode
  status: LayerStatus
  accentColor: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)

  return (
    <div
      className="overflow-hidden rounded-md border border-zinc-200 border-l-2 dark:border-zinc-800"
      style={{ borderLeftColor: accentColor }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
      >
        <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          {pill}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {name}
        </span>
        <span className="flex items-center text-zinc-400 dark:text-zinc-500">{icon}</span>
        <span className="ml-auto flex items-center gap-2.5">
          <StatusBadge status={status} />
          <ChevronIcon open={open} />
        </span>
      </button>

      {open && (
        <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Layer 1 — Validation ──────────────────────────────────────────────────────

function Layer1Panel({ flags, blocked, bodyFormat }: { flags: ValidationIssue[]; blocked: boolean; bodyFormat: ProxyResult['bodyFormat'] }) {
  const status = l1Status(flags, blocked)
  const ruleStates = getL1RuleStates(flags, bodyFormat)

  return (
    <LayerCard pill="L1" name="Validation" icon={<ShieldIcon />} status={status} accentColor="#fb7185">
      <div className="flex flex-col gap-2.5">
        {L1_RULES.map(rule => {
          const { state, flags: ruleFlags } = ruleStates.get(rule.id)!
          return (
            <div key={rule.id}>
              <div className="flex items-center gap-2">
                {state === 'pass' && <span className="w-3 shrink-0 text-xs font-bold text-green-500">✓</span>}
                {state === 'fail' && <span className="w-3 shrink-0 text-xs font-bold text-red-500">✗</span>}
                {state === 'skip' && <span className="w-3 shrink-0 text-center text-xs text-zinc-400">—</span>}
                <span className={`text-[13px] ${
                  state === 'pass' ? 'text-zinc-500 dark:text-zinc-400'
                  : state === 'fail' ? 'font-medium text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-400 dark:text-zinc-600'
                }`}>
                  {rule.label}
                </span>
                {state === 'skip' && (
                  <span className="text-[10px] text-zinc-400">
                    {rule.id === 'json' && (bodyFormat === 'form' || bodyFormat === 'multipart' || bodyFormat === 'none')
                      ? bodyFormat === 'none' ? 'no body'
                        : bodyFormat === 'form' ? 'not applicable · form-encoded'
                        : 'not applicable · multipart'
                      : 'not reached'}
                  </span>
                )}
              </div>

              {ruleFlags.map((f, i) => (
                <div key={i} className="ml-5 mt-2 flex flex-col gap-1.5 border-l-2 border-rose-200 pl-3 dark:border-rose-800">
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-rose-100 px-1.5 py-0.5 font-mono text-[10px] text-rose-700 dark:bg-rose-900 dark:text-rose-300">
                      {f.code}
                    </code>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      f.severity === 'error'
                        ? 'bg-red-600 text-white'
                        : 'bg-amber-400 text-amber-900 dark:bg-amber-600 dark:text-white'
                    }`}>
                      {f.severity === 'error' ? 'Blocked' : 'Warning'}
                    </span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">{f.message}</p>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </LayerCard>
  )
}

// ── Layer 2 — Heuristics ──────────────────────────────────────────────────────

function Layer2Panel({ flags, requestBlocked }: { flags: ValidationIssue[]; requestBlocked: boolean }) {
  const status = l2Status(flags, requestBlocked)

  return (
    <LayerCard pill="L2" name="Heuristics" icon={<RadarIcon />} status={status} accentColor="#fbbf24">
      {requestBlocked ? (
        <p className="text-[13px] text-zinc-400 dark:text-zinc-500">
          Request was blocked at Layer 1 — Layer 2 did not run.
        </p>
      ) : flags.length === 0 ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          No anomalies detected. Baseline builds after a few requests to the same endpoint.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {flags.map((f, i) => (
            <div key={`${f.code}-${i}`} className="flex items-start gap-2">
              <code className="mt-px shrink-0 rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] text-amber-800 dark:bg-amber-900 dark:text-amber-300">
                {f.code}
              </code>
              <span className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">{f.message}</span>
            </div>
          ))}
        </div>
      )}
    </LayerCard>
  )
}

// ── Layer 3 — AI Triage ───────────────────────────────────────────────────────

function renderExplanation(text: string): React.ReactNode[] {
  const parts = text.split(/("[\w\-:./ ]+"|\b[45]\d\d\b|\bGET\b|\bPOST\b|\bPUT\b|\bPATCH\b|\bDELETE\b|\bHEAD\b)/g)
  return parts.map((part, i) => {
    const isCode =
      /^"[\w\-:./ ]+"$/.test(part) ||
      /^[45]\d\d$/.test(part) ||
      /^(?:GET|POST|PUT|PATCH|DELETE|HEAD)$/.test(part)
    return isCode
      ? <code key={i} className="rounded bg-violet-100 px-1 py-0.5 font-mono text-xs text-violet-800 dark:bg-violet-900 dark:text-violet-200">{part}</code>
      : part
  })
}

function Layer3Panel({ ai, onExplain, explaining, isError, explainError, requestBlocked }: {
  ai: AIExplanation | null
  onExplain: () => void
  explaining: boolean
  isError: boolean
  explainError: string
  requestBlocked: boolean
}) {
  const [copied, setCopied] = useState(false)
  const status = l3Status(isError, ai, requestBlocked)

  function copyFix() {
    if (!ai) return
    navigator.clipboard.writeText(ai.fixSuggestion)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <LayerCard pill="L3" name="AI Triage" icon={<SparklesIcon />} status={status} accentColor="#a78bfa">
      {requestBlocked ? (
        <p className="text-[13px] text-zinc-400 dark:text-zinc-500">
          Request was blocked at Layer 1 — AI triage did not run.
        </p>
      ) : explaining ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[11px] text-violet-500 dark:text-violet-400">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
            Analyzing with Groq llama-3.3-70b-versatile…
          </div>
          <div className="flex flex-col gap-2">
            <div className="h-3 w-full animate-pulse rounded bg-violet-100 dark:bg-violet-900/40" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-violet-100 dark:bg-violet-900/40" />
            <div className="h-3 w-4/6 animate-pulse rounded bg-violet-100 dark:bg-violet-900/40" />
          </div>
        </div>
      ) : ai ? (
        <div className="flex flex-col gap-4">

          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              What happened
            </p>
            <p className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
              {renderExplanation(ai.explanation)}
            </p>
          </div>

          <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Fix</p>
            <p className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
              {renderExplanation(ai.fixSuggestion)}
            </p>
          </div>

          <div className="flex items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <span className="mr-auto rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-500 dark:bg-violet-950 dark:text-violet-400">
              {ai.source === 'cache' ? 'from cache' : 'live'}
            </span>
            <button
              onClick={copyFix}
              className="rounded border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
            >
              {copied ? 'Copied!' : 'Copy fix'}
            </button>
            <button
              disabled
              title="Coming soon"
              className="cursor-not-allowed rounded border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-400 opacity-50 dark:border-zinc-800"
            >
              Save to team knowledge
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            {isError
              ? 'Request failed — click Explain to run AI triage on this response.'
              : 'No errors detected — click Explain to analyse this response.'
            }
          </p>
          <button
            onClick={onExplain}
            className="shrink-0 rounded bg-violet-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-600 dark:bg-violet-600 dark:hover:bg-violet-500"
          >
            Explain
          </button>
        </div>
      )}

      {explainError && (
        <p className="mt-2 text-[13px] text-red-500 dark:text-red-400">{explainError}</p>
      )}
    </LayerCard>
  )
}

// ── Pipeline summary strip ────────────────────────────────────────────────────

const DOT_CLS: Record<LayerStatus, string> = {
  pass:    'bg-green-500',
  warning: 'bg-amber-400',
  blocked: 'bg-red-500',
  skipped: 'bg-zinc-400 dark:bg-zinc-600',
}

function PipelineSummary({ l1, l2, l3, result }: {
  l1: LayerStatus
  l2: LayerStatus
  l3: LayerStatus
  result: ProxyResult
}) {
  function summary(): string {
    if (result.blocked || l1 === 'blocked') return 'L1 blocked · request never forwarded'
    if (l1 === 'warning') {
      const n = result.layer1Flags.length
      return `L1 · ${n} warning${n === 1 ? '' : 's'} detected`
    }
    if (l2 === 'warning') return `L2 · ${result.layer2Flags[0]?.message ?? 'anomaly detected'}`
    if (l3 !== 'skipped') return `L3 triage complete · ${result.responseTime}ms`
    return `All checks passed · ${result.responseTime}ms`
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-center gap-2">
        {(['L1', 'L2', 'L3'] as const).map((label, i) => {
          const status = [l1, l2, l3][i]
          return (
            <span key={label} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-zinc-300 dark:text-zinc-700">›</span>}
              <span className={`h-2 w-2 rounded-full ${DOT_CLS[status]}`} />
              <span className="font-mono text-[10px] font-semibold text-zinc-500">{label}</span>
            </span>
          )
        })}
      </div>
      <div className="h-3 w-px bg-zinc-200 dark:bg-zinc-700" />
      <span className="text-[13px] text-zinc-600 dark:text-zinc-400">{summary()}</span>
    </div>
  )
}

// ── Response section ──────────────────────────────────────────────────────────

function statusColor(code: number) {
  if (code >= 500) return 'text-red-600 dark:text-red-400'
  if (code >= 400) return 'text-orange-600 dark:text-orange-400'
  if (code >= 300) return 'text-blue-600 dark:text-blue-400'
  return 'text-green-600 dark:text-green-400'
}

function ResponseSection({ result }: { result: ProxyResult }) {
  const [tab, setTab] = useState<'body' | 'headers'>('body')
  const hasLatencyAnomaly = result.layer2Flags.some(f => f.code === 'LATENCY_ANOMALY')
  const formattedBody = typeof result.body === 'string'
    ? result.body
    : JSON.stringify(result.body, null, 2)

  return (
    <div>
      {/* Section divider */}
      <div className="my-2 flex items-center gap-3">
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Response</span>
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
        {/* Status bar */}
        <div className="flex items-center gap-4 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
          <span className={`font-mono text-xl font-medium ${statusColor(result.statusCode)}`}>
            {result.statusCode}
          </span>
          <span className="text-lg font-medium text-zinc-400 dark:text-zinc-500">
            {result.responseTime}ms
          </span>
          {hasLatencyAnomaly && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              slow ×2+
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800">
          {(['body', 'headers'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-[13px] font-medium capitalize transition-colors ${
                tab === t
                  ? 'border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-50 dark:text-zinc-50'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === 'body' && <JsonBody body={formattedBody} />}
          {tab === 'headers' && (
            <div className="flex flex-col gap-1">
              {Object.entries(result.headers).map(([key, value]) => (
                <div key={key} className="flex gap-2 font-mono text-xs">
                  <span className="shrink-0 text-zinc-500">{key}:</span>
                  <span className="break-all text-zinc-900 dark:text-zinc-100">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── PipelineResult ────────────────────────────────────────────────────────────

export function PipelineResult({ result, onExplain, explaining, explainError }: {
  result: ProxyResult
  onExplain: () => void
  explaining: boolean
  explainError: string
}) {
  const isError = result.statusCode >= 400
  const blocked = result.blocked ?? false

  const l1 = l1Status(result.layer1Flags, blocked)
  const l2 = l2Status(result.layer2Flags, blocked)
  const l3 = l3Status(isError, result.aiExplanation, blocked)

  return (
    <div className="flex flex-col gap-3">
      <PipelineSummary l1={l1} l2={l2} l3={l3} result={result} />
      <Layer1Panel flags={result.layer1Flags} blocked={blocked} bodyFormat={result.bodyFormat} />
      <Layer2Panel flags={result.layer2Flags} requestBlocked={blocked} />
      <Layer3Panel
        ai={result.aiExplanation}
        onExplain={onExplain}
        explaining={explaining}
        isError={isError}
        explainError={explainError}
        requestBlocked={blocked}
      />
      {!blocked && <ResponseSection result={result} />}
    </div>
  )
}
