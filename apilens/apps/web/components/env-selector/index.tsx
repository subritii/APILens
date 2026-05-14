'use client'

import { useState, useRef } from 'react'
import { ENV_COLORS } from '@/hooks/use-environments'
import type { Environment, EnvVariable } from '@/hooks/use-environments'

interface Props {
  environments: Environment[]
  activeEnvId: string | null
  onSetActive: (id: string | null) => void
  onCreateEnvironment: (name: string, color?: string) => Environment
  onUpdateEnvironment: (id: string, variables: EnvVariable[]) => void
  onUpdateEnvironmentColor: (id: string, color: string) => void
  onDeleteEnvironment: (id: string) => void
}

function GlobeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function EnvSelector({
  environments,
  activeEnvId,
  onSetActive,
  onCreateEnvironment,
  onUpdateEnvironment,
  onUpdateEnvironmentColor,
  onDeleteEnvironment,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [quickViewOpen, setQuickViewOpen] = useState(false)

  // Fix 2: auto-save indicator
  const [showSaved, setShowSaved] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Fix 2: row-level green flash — key is `${envId}-${rowIndex}`
  const [highlightedRow, setHighlightedRow] = useState<string | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const activeEnv = environments.find(e => e.id === activeEnvId)
  const activeVars = activeEnv?.variables.filter(v => v.key.trim()) ?? []

  function triggerSaved() {
    setShowSaved(true)
    clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setShowSaved(false), 2000)
  }

  function triggerRowHighlight(envId: string, index: number) {
    const key = `${envId}-${index}`
    setHighlightedRow(key)
    clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlightedRow(null), 500)
  }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const created = onCreateEnvironment(name)
    setNewName('')
    setEditingId(created.id)
  }

  function updateVar(env: Environment, index: number, field: 'key' | 'value', val: string) {
    const next = [...env.variables]
    next[index] = { ...next[index], [field]: val }
    if (index === next.length - 1 && val !== '') next.push({ key: '', value: '' })
    onUpdateEnvironment(env.id, next)
  }

  function onVarBlur(env: Environment, index: number) {
    const v = env.variables[index]
    if (v.key.trim()) {
      triggerRowHighlight(env.id, index)
      triggerSaved()
    }
  }

  function removeVar(env: Environment, index: number) {
    const next = env.variables.length === 1
      ? [{ key: '', value: '' }]
      : env.variables.filter((_, i) => i !== index)
    onUpdateEnvironment(env.id, next)
  }

  return (
    <>
      {/* ── Header controls ── */}
      <div className="flex items-center gap-1.5">
        <span className="text-zinc-400"><GlobeIcon /></span>

        {/* Dropdown with env-color left border */}
        <div
          className="rounded border border-zinc-200 overflow-hidden dark:border-zinc-700"
          style={activeEnv ? { borderLeftColor: activeEnv.color, borderLeftWidth: 3 } : undefined}
        >
          <select
            value={activeEnvId ?? ''}
            onChange={e => onSetActive(e.target.value || null)}
            className="bg-transparent px-2 py-1 text-xs text-zinc-700 focus:outline-none dark:text-zinc-300"
          >
            <option value=''>No Environment</option>
            {environments.map(env => (
              <option key={env.id} value={env.id}>{env.name}</option>
            ))}
          </select>
        </div>

        {/* Fix 5: Eye icon — quick-view tooltip on hover */}
        {activeEnv && activeVars.length > 0 && (
          <div className="relative">
            <button
              onMouseEnter={() => setQuickViewOpen(true)}
              onMouseLeave={() => setQuickViewOpen(false)}
              className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              title="Quick view variables"
            >
              <EyeIcon />
            </button>

            {quickViewOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-52 rounded-md border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                <p className="mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  {activeEnv.name}
                </p>
                {activeVars.slice(0, 5).map(v => (
                  <div key={v.key} className="flex items-baseline gap-2 py-0.5">
                    <span className="font-mono text-xs text-zinc-500 shrink-0">{v.key}</span>
                    <span className="font-mono text-xs text-zinc-900 truncate dark:text-zinc-100">{v.value}</span>
                  </div>
                ))}
                {activeVars.length > 5 && (
                  <p className="mt-1.5 text-xs text-zinc-400">+{activeVars.length - 5} more — open ⚙ to see all</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Gear button */}
        <button
          onClick={() => setModalOpen(true)}
          title="Manage environments"
          className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <GearIcon />
        </button>
      </div>

      {/* ── Modal ── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}
        >
          <div className="flex w-full max-w-lg flex-col rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">

            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Environments</h2>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">

              {/* Fix 3: section label for existing envs */}
              <div className="bg-zinc-50 px-5 py-2 dark:bg-zinc-900">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  {environments.length === 0 ? 'No environments yet' : 'Existing Environments'}
                </span>
              </div>

              <div className="flex flex-col gap-4 px-5 py-4">
                {environments.map(env => (
                  <div key={env.id} className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        {ENV_COLORS.map(color => (
                          <button
                            key={color}
                            onClick={() => onUpdateEnvironmentColor(env.id, color)}
                            style={{ backgroundColor: color }}
                            className={`h-3 w-3 rounded-full transition-transform hover:scale-125 ${env.color === color ? 'ring-2 ring-offset-1 ring-zinc-400' : ''}`}
                          />
                        ))}
                      </div>

                      <button
                        onClick={() => setEditingId(editingId === env.id ? null : env.id)}
                        className="flex-1 text-left text-xs font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
                      >
                        {editingId === env.id ? '▾' : '▸'} {env.name}
                      </button>

                      <button
                        onClick={() => onDeleteEnvironment(env.id)}
                        className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
                      >
                        Delete
                      </button>
                    </div>

                    {/* Variable editor */}
                    {editingId === env.id && (
                      <div className="ml-2 flex flex-col gap-1.5 border-l-2 pl-3" style={{ borderLeftColor: env.color }}>
                        {env.variables.map((v, i) => {
                          const rowKey = `${env.id}-${i}`
                          const isHighlighted = highlightedRow === rowKey
                          return (
                            <div
                              key={i}
                              className={`flex gap-2 rounded px-1 transition-colors duration-300 ${isHighlighted ? 'bg-green-50 dark:bg-green-950' : ''}`}
                            >
                              <input
                                value={v.key}
                                onChange={e => updateVar(env, i, 'key', e.target.value)}
                                onBlur={() => onVarBlur(env, i)}
                                placeholder="VARIABLE_NAME"
                                className="w-2/5 rounded border border-zinc-200 bg-transparent px-2 py-1 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:text-zinc-50"
                              />
                              <input
                                value={v.value}
                                onChange={e => updateVar(env, i, 'value', e.target.value)}
                                onBlur={() => onVarBlur(env, i)}
                                placeholder="value"
                                className="flex-1 rounded border border-zinc-200 bg-transparent px-2 py-1 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:text-zinc-50"
                              />
                              <button
                                onClick={() => removeVar(env, i)}
                                className="px-1 text-zinc-400 hover:text-red-500 transition-colors text-xs"
                              >
                                ✕
                              </button>
                            </div>
                          )
                        })}
                        <p className="mt-1 font-mono text-xs text-zinc-400">
                          Use <span className="text-zinc-600 dark:text-zinc-300">{'{{VARIABLE_NAME}}'}</span> in URLs and headers.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Fix 3: section label for create new */}
              <div className="bg-zinc-50 px-5 py-2 dark:bg-zinc-900">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Create New</span>
              </div>

              {/* Fix 1: button changes label + color when name is typed */}
              <form onSubmit={submitCreate} className="flex gap-2 px-5 py-4">
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Environment name"
                  className="flex-1 rounded border border-zinc-300 bg-transparent px-2 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:text-zinc-50"
                />
                <button
                  type="submit"
                  className={`rounded px-3 py-1.5 text-xs font-medium text-white transition-colors ${
                    newName.trim()
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-zinc-300 cursor-not-allowed dark:bg-zinc-700'
                  }`}
                >
                  {newName.trim() ? 'Save & Add Variables' : 'Create'}
                </button>
              </form>
            </div>

            {/* Fix 3: modal footer with Done button + Fix 2: saved indicator */}
            <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
              <span className={`text-xs transition-opacity duration-300 ${showSaved ? 'opacity-100 text-green-600 dark:text-green-400' : 'opacity-0'}`}>
                ✓ All changes saved
              </span>
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
