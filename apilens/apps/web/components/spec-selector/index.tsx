'use client'

import { useState } from 'react'
import type { ActiveSpec } from '@/hooks/use-spec'

function BookIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

interface Props {
  activeSpec: ActiveSpec | null
  loading: boolean
  error: string
  onLoad: (url: string) => Promise<boolean>
  onClear: () => void
}

export function SpecSelector({ activeSpec, loading, error, onLoad, onClear }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [url, setUrl] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    const ok = await onLoad(url.trim())
    if (ok) {
      setModalOpen(false)
      setUrl('')
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className="text-zinc-400"><BookIcon /></span>

        <button
          onClick={() => setModalOpen(true)}
          className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-700 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
        >
          {activeSpec ? activeSpec.title : 'No Spec'}
        </button>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}
        >
          <div className="flex w-full max-w-md flex-col rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">

            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">OpenAPI Spec</h2>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">

              {/* Active spec info */}
              {activeSpec && (
                <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900">
                  <div>
                    <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">{activeSpec.title}</p>
                    <p className="text-xs text-zinc-500">v{activeSpec.version} · {activeSpec.pathCount} endpoints</p>
                  </div>
                  <button
                    onClick={() => { onClear(); setModalOpen(false) }}
                    className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Load form */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
                  {activeSpec ? 'Load a different spec' : 'Load a spec by URL'}
                </p>
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <input
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://petstore3.swagger.io/api/v3/openapi.json"
                    className="flex-1 rounded border border-zinc-300 bg-transparent px-2 py-1.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:text-zinc-50"
                  />
                  <button
                    type="submit"
                    disabled={loading || !url.trim()}
                    className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
                  >
                    {loading ? 'Loading…' : 'Load'}
                  </button>
                </form>
                {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
                <p className="mt-2 text-xs text-zinc-400">
                  Paste any public OpenAPI 3.x JSON URL. Once loaded, request and response bodies are validated against the spec automatically.
                </p>
              </div>
            </div>

            <div className="flex justify-end border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
              <button
                onClick={() => setModalOpen(false)}
                className="rounded bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
