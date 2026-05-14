'use client'

import { useState } from 'react'
import type { Collection, SavedRequest } from '@/hooks/use-collections'

interface Props {
  collections: Collection[]
  onLoadRequest: (req: SavedRequest) => void
  onCreateCollection: (name: string) => void
  onDeleteRequest: (collectionId: string, requestId: string) => void
  onDeleteCollection: (collectionId: string) => void
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-green-600 dark:text-green-400',
  POST: 'text-blue-600 dark:text-blue-400',
  PUT: 'text-orange-600 dark:text-orange-400',
  PATCH: 'text-yellow-600 dark:text-yellow-400',
  DELETE: 'text-red-600 dark:text-red-400',
}

export function Sidebar({
  collections,
  onLoadRequest,
  onCreateCollection,
  onDeleteRequest,
  onDeleteCollection,
}: Props) {
  const [newCollectionName, setNewCollectionName] = useState('')
  const [creating, setCreating] = useState(false)

  function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = newCollectionName.trim()
    if (!name) return
    onCreateCollection(name)
    setNewCollectionName('')
    setCreating(false)
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Collections
        </span>
        <button
          onClick={() => setCreating(v => !v)}
          className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors text-lg leading-none"
          title="New collection"
        >
          +
        </button>
      </div>

      {creating && (
        <form onSubmit={submitCreate} className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">
          <input
            autoFocus
            value={newCollectionName}
            onChange={e => setNewCollectionName(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && setCreating(false)}
            placeholder="Collection name"
            className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:text-zinc-50"
          />
        </form>
      )}

      <div className="flex-1 overflow-y-auto">
        {collections.length === 0 && (
          <p className="px-3 py-4 text-xs text-zinc-400">No collections yet. Hit + to create one.</p>
        )}

        {collections.map(collection => (
          <CollectionItem
            key={collection.id}
            collection={collection}
            onLoadRequest={onLoadRequest}
            onDeleteRequest={onDeleteRequest}
            onDeleteCollection={onDeleteCollection}
          />
        ))}
      </div>
    </aside>
  )
}

function CollectionItem({
  collection,
  onLoadRequest,
  onDeleteRequest,
  onDeleteCollection,
}: {
  collection: Collection
  onLoadRequest: (req: SavedRequest) => void
  onDeleteRequest: (collectionId: string, requestId: string) => void
  onDeleteCollection: (collectionId: string) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div>
      <div className="group flex items-center justify-between px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 flex-1 text-left"
        >
          <span className="text-zinc-400">{open ? '▾' : '▸'}</span>
          {collection.name}
        </button>
        <button
          onClick={() => onDeleteCollection(collection.id)}
          className="hidden group-hover:block text-zinc-400 hover:text-red-500 transition-colors text-xs px-1"
          title="Delete collection"
        >
          ✕
        </button>
      </div>

      {open && collection.requests.map(req => (
        <div
          key={req.id}
          className="group flex items-center justify-between pl-6 pr-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
          onClick={() => onLoadRequest(req)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`shrink-0 font-mono text-xs font-semibold ${METHOD_COLORS[req.method] ?? 'text-zinc-500'}`}>
              {req.method}
            </span>
            <span className="truncate text-xs text-zinc-600 dark:text-zinc-400">{req.name}</span>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onDeleteRequest(collection.id, req.id) }}
            className="hidden group-hover:block text-zinc-400 hover:text-red-500 transition-colors text-xs px-1 shrink-0"
            title="Delete request"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
