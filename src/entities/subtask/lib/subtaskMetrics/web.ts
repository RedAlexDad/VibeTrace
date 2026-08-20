import type { OcMessage } from '@/shared/types/opencode'
import { parseWebsearchTitleQuery } from '@/entities/action/lib/actionTooltipMapping'
import { normalizeToolNameLocal, strInput } from './files'

/** websearch queries / webfetch URLs in timeline order. */
export function collectWebSearchQueriesFromMessages(msgs: OcMessage[]): string[] {
  const out: string[] = []
  for (const m of msgs) {
    for (const part of m.parts) {
      if (part.type !== 'tool') continue
      const t = normalizeToolNameLocal(part.tool)
      if (t !== 'websearch' && t !== 'web_search' && t !== 'webfetch' && t !== 'web_fetch') continue
      const input = part.state?.input as Record<string, unknown> | undefined
      const st = part.state as { title?: string } | undefined
      if (t === 'websearch' || t === 'web_search') {
        const q = strInput(input?.query) ?? parseWebsearchTitleQuery(st?.title)
        if (q) out.push(q)
        else out.push('(empty query)')
      } else {
        const url = strInput(input?.url) ?? strInput(st?.title)
        if (url) out.push(url)
        else out.push('(empty url)')
      }
    }
  }
  return out
}