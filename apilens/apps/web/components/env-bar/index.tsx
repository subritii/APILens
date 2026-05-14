'use client'

import { useState } from 'react'
import type { Environment, EnvVariable } from '@/hooks/use-environments'

interface Props {
  environments: Environment[]
  activeEnvId: string | null
  onSetActive: (id: string | null) => void
  onCreateEnvironment: (name: string) => Environment
  onUpdateEnvironment: (id: string, variables: EnvVariable[]) => void
  onDeleteEnvironment: (id: string) => void
}

export function EnvBar({
  environments,
  activeEnvId,
  onSetActive,
  onCreateEnvironment,
  onUpdateEnvironment,
  onDeleteEnvironment,
}: Props) {
  const [open, setOpen] = useState(false)
  const [newEnvName, setNewEnvName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const activeEnv = environments.find(e => e.id === activeEnvId)

  function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = newEnvName.trim()
    if (!name) return
    const created = onCreateEnvironment(name)
    setNewEnvName('')
    setEditingId(created.id)
  }

  function updateVar(env: Environment, index: number, field: 'key' | 'value', val: string) {
    const next = [...env.variables]
    next[index] = { ...next[index], [field]: val }
    // Auto-expand: add a new row when typing in the last one
    if (index === next.length - 1 && val !== '') {
      next.push({ key: '', value: '' })
    }
    onUpdateEnvironment(env.id, next)
  }

  function removeVar(env: Environment, index: number) {
    const next = env.variables.length === 1
      ? [{ key: '', value: '' }]
      : env.variables.filter((_, i) => i !== index)
    onUpdateEnvironment(env.id, next)
  }

  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-6 py-2">
        <span className="text-xs text-zinc-400">Environment:</span>

        <select
          value={activeEnvId ?? ''}
          onChange={e => onSetActive(e.target.value || null)}
          className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-xs text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
        >
          <option value=''>None</option>
          {environments.map(env => (
            <option key={env.id} value={env.id}>{env.name}</option>
          ))}
        </select>

        <button
          onClick={() => setOpen(v => !v)}
          className="text-xs text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
        >
          {open ? 'Close' : 'Manage'}
        </button>
      </div>

      {/* ── Manage panel ── */}
      {open && (
        <div className="border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <div className="flex flex-col gap-4">

            {/* Create new environment */}
            <form onSubmit={submitCreate} className="flex gap-2">
              <input
                value={newEnvName}
                onChange={e => setNewEnvName(e.target.value)}
                placeholder="New environment name"
                className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:text-zinc-50"
              />
              <button
                type="submit"
                className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900"
              >
                Create
              </button>
            </form>

            {/* List of environments */}
            {environments.map(env => (
              <div key={env.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditingId(editingId === env.id ? null : env.id)}
                    className="text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50"
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

                {/* Variable editor for the expanded environment */}
                {editingId === env.id && (
                  <div className="ml-3 flex flex-col gap-1.5">
                    {env.variables.map((v, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          value={v.key}
                          onChange={e => updateVar(env, i, 'key', e.target.value)}
                          placeholder="VARIABLE_NAME"
                          className="w-2/5 rounded border border-zinc-200 bg-transparent px-2 py-1 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:text-zinc-50"
                        />
                        <input
                          value={v.value}
                          onChange={e => updateVar(env, i, 'value', e.target.value)}
                          placeholder="value"
                          className="flex-1 rounded border border-zinc-200 bg-transparent px-2 py-1 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:text-zinc-50"
                        />
                        <button
                          onClick={() => removeVar(env, i)}
                          className="px-2 text-zinc-400 hover:text-red-500 transition-colors text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <p className="text-xs text-zinc-400 mt-1">
                      Use <code className="font-mono">{'{{VARIABLE_NAME}}'}</code> in your URL or headers.
                    </p>
                  </div>
                )}
              </div>
            ))}

          </div>
        </div>
      )}
    </div>
  )
}
