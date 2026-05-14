'use client'

import { useState, useEffect, startTransition } from 'react'

export interface SavedRequest {
  id: string
  name: string
  method: string
  url: string
  headers: { key: string; value: string }[]
  body: string
}

export interface Collection {
  id: string
  name: string
  requests: SavedRequest[]
}

const STORAGE_KEY = 'apilens_collections'

function load(): Collection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persist(collections: Collection[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collections))
}

export function useCollections() {
  const [collections, setCollections] = useState<Collection[]>([])

  // localStorage is only available in the browser, not during SSR.
  // Reading it in useEffect ensures we never run this on the server.
  useEffect(() => {
    startTransition(() => {
      setCollections(load())
    })
  }, [])

  function createCollection(name: string): Collection {
    const collection: Collection = {
      id: crypto.randomUUID(),
      name,
      requests: [],
    }
    const next = [...collections, collection]
    persist(next)
    setCollections(next)
    return collection
  }

  function saveRequest(collectionId: string, req: Omit<SavedRequest, 'id'>) {
    const next = collections.map(c => {
      if (c.id !== collectionId) return c
      return {
        ...c,
        requests: [...c.requests, { ...req, id: crypto.randomUUID() }],
      }
    })
    persist(next)
    setCollections(next)
  }

  function deleteRequest(collectionId: string, requestId: string) {
    const next = collections.map(c => {
      if (c.id !== collectionId) return c
      return { ...c, requests: c.requests.filter(r => r.id !== requestId) }
    })
    persist(next)
    setCollections(next)
  }

  function deleteCollection(collectionId: string) {
    const next = collections.filter(c => c.id !== collectionId)
    persist(next)
    setCollections(next)
  }

  return { collections, createCollection, saveRequest, deleteRequest, deleteCollection }
}
