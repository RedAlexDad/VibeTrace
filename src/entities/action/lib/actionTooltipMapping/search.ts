import { URL_LIST_MAX } from './types'

/** websearch output: count lines starting with `URL:` */
export function countUrlLinesInToolOutput(output: string | undefined): number {
  if (!output) return 0
  const m = output.match(/^URL:\s*\S+/gm)
  return m?.length ?? 0
}

export function extractUrlsFromSearchOutput(
  output: string | undefined,
  limit = URL_LIST_MAX,
): string[] {
  if (!output) return []
  const re = /^URL:\s*(https?:\/\/\S+)/gm
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(output)) && out.length < limit) {
    out.push(m[1]!)
  }
  return out
}

export function parseWebsearchTitleQuery(title: string | undefined): string | undefined {
  if (!title) return undefined
  const m = title.match(/^Web\s*search:\s*(.+)$/i)
  return m?.[1]?.trim() || undefined
}