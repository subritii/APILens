'use client'

import { useState } from 'react'

export interface ActiveSpec {
  key: string
  title: string
  version: string
  pathCount: number
}

export function useSpec() {
  const [activeSpec, setActiveSpec] = useState<ActiveSpec | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadSpec(url: string): Promise<boolean> {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to load spec.')
        return false
      }
      setActiveSpec(data)
      return true
    } catch {
      setError('Could not reach the APILens backend.')
      return false
    } finally {
      setLoading(false)
    }
  }

  function clearSpec() {
    setActiveSpec(null)
    setError('')
  }

  return { activeSpec, loading, error, loadSpec, clearSpec }
}
