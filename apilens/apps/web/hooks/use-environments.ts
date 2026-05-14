'use client'

import { useState, useEffect, startTransition } from 'react'

export interface EnvVariable {
  key: string
  value: string
}

export const ENV_COLORS = ['#16a34a', '#2563eb', '#ea580c', '#7c3aed', '#dc2626', '#6b7280']

export interface Environment {
  id: string
  name: string
  color: string
  variables: EnvVariable[]
}

const ENVS_KEY = 'apilens_environments'
const ACTIVE_KEY = 'apilens_active_env'

function load(): Environment[] {
  try {
    const raw = localStorage.getItem(ENVS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persist(envs: Environment[]) {
  localStorage.setItem(ENVS_KEY, JSON.stringify(envs))
}

export function useEnvironments() {
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [activeEnvId, setActiveEnvIdState] = useState<string | null>(null)

  useEffect(() => {
    startTransition(() => {
      setEnvironments(load())
      setActiveEnvIdState(localStorage.getItem(ACTIVE_KEY))
    })
  }, [])

  function setActiveEnvId(id: string | null) {
    if (id) localStorage.setItem(ACTIVE_KEY, id)
    else localStorage.removeItem(ACTIVE_KEY)
    setActiveEnvIdState(id)
  }

  function createEnvironment(name: string, color?: string): Environment {
    const usedColors = environments.map(e => e.color)
    const defaultColor = ENV_COLORS.find(c => !usedColors.includes(c)) ?? ENV_COLORS[0]
    const env: Environment = {
      id: crypto.randomUUID(),
      name,
      color: color ?? defaultColor,
      variables: [{ key: '', value: '' }],
    }
    const next = [...environments, env]
    persist(next)
    setEnvironments(next)
    return env
  }

  function updateEnvironment(id: string, variables: EnvVariable[]) {
    const next = environments.map(e => e.id === id ? { ...e, variables } : e)
    persist(next)
    setEnvironments(next)
  }

  function updateEnvironmentColor(id: string, color: string) {
    const next = environments.map(e => e.id === id ? { ...e, color } : e)
    persist(next)
    setEnvironments(next)
  }

  function deleteEnvironment(id: string) {
    const next = environments.filter(e => e.id !== id)
    persist(next)
    setEnvironments(next)
    if (activeEnvId === id) setActiveEnvId(null)
  }

  const activeEnv = environments.find(e => e.id === activeEnvId) ?? null

  return {
    environments,
    activeEnv,
    activeEnvId,
    setActiveEnvId,
    createEnvironment,
    updateEnvironment,
    updateEnvironmentColor,
    deleteEnvironment,
  }
}
