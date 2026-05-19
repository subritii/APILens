'use client'

import { useState } from 'react'

// ── JSON syntax highlighting ──────────────────────────────────────────────────

type TokenType = 'key' | 'string' | 'number' | 'bool' | 'null' | 'punct' | 'space'
type Token = { type: TokenType; value: string }

const TOKEN_COLORS: Partial<Record<TokenType, string>> = {
  key:    'text-blue-600 dark:text-blue-400',
  string: 'text-teal-600 dark:text-teal-400',
  number: 'text-amber-600 dark:text-amber-400',
  bool:   'text-amber-600 dark:text-amber-400',
  null:   'text-red-500 dark:text-red-400',
  punct:  'text-zinc-400 dark:text-zinc-500',
}

function tokenizeJSON(json: string): Token[] {
  const out: Token[] = []
  const re = /("(?:[^"\\]|\\.)*")|(true|false)|(null)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\],:])|(\s+)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(json)) !== null) {
    if (m.index > last) out.push({ type: 'space', value: json.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ type: 'string', value: m[1] })
    else if (m[2] !== undefined) out.push({ type: 'bool', value: m[2] })
    else if (m[3] !== undefined) out.push({ type: 'null', value: m[3] })
    else if (m[4] !== undefined) out.push({ type: 'number', value: m[4] })
    else if (m[5] !== undefined) out.push({ type: 'punct', value: m[5] })
    else if (m[6] !== undefined) out.push({ type: 'space', value: m[6] })
    last = re.lastIndex
  }
  if (last < json.length) out.push({ type: 'space', value: json.slice(last) })

  for (let i = 0; i < out.length; i++) {
    if (out[i].type === 'string') {
      let j = i + 1
      while (j < out.length && out[j].type === 'space') j++
      if (j < out.length && out[j].type === 'punct' && out[j].value === ':') {
        out[i] = { type: 'key', value: out[i].value }
      }
    }
  }
  return out
}

const COLLAPSE_LINES = 50

export function JsonBody({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false)
  const lines = body.split('\n')
  const collapsible = lines.length > COLLAPSE_LINES
  const visible = collapsible && !expanded ? lines.slice(0, COLLAPSE_LINES).join('\n') : body

  const trimmed = body.trimStart()
  const isJson = trimmed.startsWith('{') || trimmed.startsWith('[')
  const tokens = isJson ? tokenizeJSON(visible) : null

  return (
    <div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs">
        {tokens
          ? tokens.map((tok, i) => {
              const cls = TOKEN_COLORS[tok.type]
              return cls ? <span key={i} className={cls}>{tok.value}</span> : tok.value
            })
          : <span className="text-zinc-800 dark:text-zinc-200">{visible}</span>
        }
        {collapsible && !expanded && <span className="text-zinc-400"> …</span>}
      </pre>
      {collapsible && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-2 text-xs text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
        >
          {expanded ? 'Collapse' : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  )
}
