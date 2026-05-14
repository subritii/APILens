'use client'

import { useState } from 'react'
import { useCollections } from '@/hooks/use-collections'
import { useEnvironments } from '@/hooks/use-environments'
import { useSpec } from '@/hooks/use-spec'
import type { SavedRequest } from '@/hooks/use-collections'
import { Sidebar } from '@/components/sidebar'
import { EnvSelector } from '@/components/env-selector'
import { SpecSelector } from '@/components/spec-selector'
import { RequestBuilder } from '@/components/request-builder'

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
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">APILens</h1>

        <div className="flex items-center gap-4">
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

          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />

          <span className="text-xs text-zinc-500">{email}</span>
          <form action={logout}>
            <button
              type="submit"
              className="text-xs text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-50"
            >
              Sign out
            </button>
          </form>
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
