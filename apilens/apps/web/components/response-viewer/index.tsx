'use client'

import { useState } from 'react'
import type { ProxyResult, AIExplanation } from '@/components/request-builder'

function statusColor(code: number) {
  if (code >= 500) return 'text-red-600 dark:text-red-400'
  if (code >= 400) return 'text-orange-600 dark:text-orange-400'
  if (code >= 300) return 'text-blue-600 dark:text-blue-400'
  return 'text-green-600 dark:text-green-400'
}

function AIPanel({ ai, onExplain, explaining, isError }: {
  ai: AIExplanation | null
  onExplain: () => void
  explaining: boolean
  isError: boolean
}) {
  if (ai) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2.5 dark:border-violet-900 dark:bg-violet-950">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400">
            AI Triage
          </p>
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:bg-violet-900 dark:text-violet-300">
            {ai.source === 'cache' ? 'from cache' : 'claude'}
          </span>
        </div>
        <p className="text-xs text-violet-900 dark:text-violet-100">{ai.explanation}</p>
        <div className="border-t border-violet-200 pt-2 dark:border-violet-800">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-500 dark:text-violet-400">Fix</p>
          <p className="text-xs text-violet-800 dark:text-violet-200">{ai.fixSuggestion}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs text-zinc-500">
        {isError ? 'AI explanation unavailable — try manually?' : 'Want to understand this response?'}
      </p>
      <button
        onClick={onExplain}
        disabled={explaining}
        className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {explaining ? 'Asking Claude…' : 'Explain'}
      </button>
    </div>
  )
}

export function ResponseViewer({ result, onExplain, explaining }: {
  result: ProxyResult
  onExplain: () => void
  explaining: boolean
}) {
  const [tab, setTab] = useState<'body' | 'headers'>('body')

  const formattedBody =
    typeof result.body === 'string'
      ? result.body
      : JSON.stringify(result.body, null, 2)

  const warnings = result.warnings ?? []
  const isError = result.statusCode >= 400

  return (
    <div className="flex flex-col gap-2">

      {/* ── Warnings panel ── */}
      {warnings.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Warnings
          </p>
          {warnings.map(w => (
            <div key={w.code} className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
              <span className="mt-px shrink-0">⚠</span>
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── AI Triage panel ── */}
      <AIPanel
        ai={result.aiExplanation}
        onExplain={onExplain}
        explaining={explaining}
        isError={isError}
      />

      <div className="rounded-md border border-zinc-200 dark:border-zinc-800">

        {/* ── Status bar ── */}
        <div className="flex items-center gap-4 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <span className={`font-mono text-sm font-semibold ${statusColor(result.statusCode)}`}>
            {result.statusCode}
          </span>
          <span className="text-xs text-zinc-500">{result.responseTime}ms</span>
        </div>

        {/* ── Tabs: Body / Headers ── */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800">
          {(['body', 'headers'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? 'border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-50 dark:text-zinc-50'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-3">
          {tab === 'body' && (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-zinc-800 dark:text-zinc-200">
              {formattedBody}
            </pre>
          )}

          {tab === 'headers' && (
            <div className="flex flex-col gap-1">
              {Object.entries(result.headers).map(([key, value]) => (
                <div key={key} className="flex gap-2 font-mono text-xs">
                  <span className="text-zinc-500 shrink-0">{key}:</span>
                  <span className="text-zinc-900 dark:text-zinc-100 break-all">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
