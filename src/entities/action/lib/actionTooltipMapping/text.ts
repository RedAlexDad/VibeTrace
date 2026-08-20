export function normalizeToolName(name: string): string {
  return name.trim().toLowerCase().replace(/-/g, '_')
}

/** First `maxWords` word-like segments (Intl.Segmenter); fallback: whitespace tokens. */
export function truncateToMaxWords(s: string, maxWords: number): string {
  const t = s.trim()
  if (!t) return t
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    try {
      const seg = new Intl.Segmenter(undefined, { granularity: 'word' })
      let wordCount = 0
      const out: string[] = []
      for (const part of seg.segment(t)) {
        if (part.isWordLike) {
          if (wordCount >= maxWords) {
            return out.join('') + '…'
          }
          wordCount++
        }
        out.push(part.segment)
      }
      return t
    } catch {
      /* fall through */
    }
  }
  const words = t.split(/\s+/)
  if (words.length <= maxWords) return t
  return words.slice(0, maxWords).join(' ') + '…'
}

export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** String field including empty `""` (e.g. `state.title`) */
export function stringField(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

export function formatToolError(err: unknown): string {
  if (err == null) return ''
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err, null, 2)
  } catch {
    return String(err)
  }
}

export function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

export function escapeForActionTooltip(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
