'use client'

import { useState, useRef, useEffect } from 'react'
import { useCollections } from '@/hooks/use-collections'
import { useEnvironments } from '@/hooks/use-environments'
import { useSpec } from '@/hooks/use-spec'
import type { SavedRequest } from '@/hooks/use-collections'
import { Sidebar } from '@/components/sidebar'
import { EnvSelector } from '@/components/env-selector'
import { SpecSelector } from '@/components/spec-selector'
import { RequestBuilder } from '@/components/request-builder'

function AccountMenu({ email, logout }: { email: string; logout: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const initial = email[0]?.toUpperCase() ?? '?'

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-48 rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
            <p className="truncate text-xs text-zinc-500">{email}</p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              onClick={() => setOpen(false)}
              className="w-full px-3 py-2 text-left text-xs text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

interface Props {
  email: string
  logout: () => Promise<void>
}

export function Workspace({ email, logout }: Props) {
  const { collections, createCollection, saveRequest, deleteRequest, deleteCollection } =
    useCollections()

  const {
    environments,
    activeEnv,
    activeEnvId,
    setActiveEnvId,
    createEnvironment,
    updateEnvironment,
    updateEnvironmentColor,
    deleteEnvironment,
  } = useEnvironments()

  const { activeSpec, loading: specLoading, error: specError, loadSpec, clearSpec } = useSpec()

  const [loadedRequest, setLoadedRequest] = useState<SavedRequest | null>(null)

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-zinc-950">

      {/* ── Header ── */}
      <header className="flex shrink-0 items-center border-b border-zinc-200 px-6 py-2 dark:border-zinc-800">

        {/* Zone 1: Brand */}
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">APILens</h1>
        </div>

        {/* Zone 2: Per-request context */}
        <div className="flex items-center gap-3">
          <EnvSelector
            environments={environments}
            activeEnvId={activeEnvId}
            onSetActive={setActiveEnvId}
            onCreateEnvironment={createEnvironment}
            onUpdateEnvironment={updateEnvironment}
            onUpdateEnvironmentColor={updateEnvironmentColor}
            onDeleteEnvironment={deleteEnvironment}
          />
          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
          <SpecSelector
            activeSpec={activeSpec}
            loading={specLoading}
            error={specError}
            onLoad={loadSpec}
            onClear={clearSpec}
          />
        </div>

        {/* Zone 3: Account */}
        <div className="flex flex-1 justify-end">
          <AccountMenu email={email} logout={logout} />
        </div>

      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          collections={collections}
          onLoadRequest={setLoadedRequest}
          onCreateCollection={createCollection}
          onDeleteRequest={deleteRequest}
          onDeleteCollection={deleteCollection}
        />

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <RequestBuilder
            key={loadedRequest?.id ?? 'default'}
            initialMethod={loadedRequest?.method}
            initialUrl={loadedRequest?.url}
            initialHeaders={loadedRequest?.headers}
            initialBody={loadedRequest?.body}
            collections={collections}
            onSave={saveRequest}
            activeEnv={activeEnv}
            activeSpecKey={activeSpec?.key ?? null}
          />
        </div>
      </div>
    </div>
  )
}
