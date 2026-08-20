import type { ReactNode } from 'react'

// Lightweight JSON syntax highlighter: pretty-printed JSON -> colored React nodes.
// Colors come from --color-code-* CSS variables (defined in light + dark themes).

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g

function tokenColor(token: string): string {
  if (token === 'true' || token === 'false') return 'var(--color-code-boolean)'
  if (token === 'null') return 'var(--color-code-null)'
  return 'var(--color-code-punct)'
}

/** Renders pretty-printed JSON text with per-token colors. */
export function highlightJson(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  TOKEN.lastIndex = 0
  while ((match = TOKEN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const [full, str, colon] = match
    if (str !== undefined) {
      // Object key (string immediately followed by a colon)
      if (colon !== undefined) {
        nodes.push(
          <span key={key++} style={{ color: 'var(--color-code-key)' }}>
            {str}
          </span>,
        )
        nodes.push(
          <span key={key++} style={{ color: 'var(--color-code-punct)' }}>
            {colon}
          </span>,
        )
      } else {
        nodes.push(
          <span key={key++} style={{ color: 'var(--color-code-string)' }}>
            {str}
          </span>,
        )
      }
    } else {
      const trimmed = full.trim()
      nodes.push(
        <span key={key++} style={{ color: tokenColor(trimmed) }}>
          {full}
        </span>,
      )
    }
    lastIndex = TOKEN.lastIndex
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}
