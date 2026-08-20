import type { OcSseActionEvent } from '@/shared/types/opencode'
import type { MappedAction } from '@/shared/types/opencode'
import { actionRowForBand } from './layout'

function safeDetail(raw: unknown): string {
  try {
    return JSON.stringify(raw).slice(0, 160)
  } catch {
    return ''
  }
}

export function mapSseToMappedActions(
  events: OcSseActionEvent[],
): (MappedAction & { row: number })[] {
  const out: (MappedAction & { row: number })[] = []
  for (const ev of events) {
    if (ev.type === 'permission.asked') {
      out.push({
        actionType: 'Permission',
        status: 'pending',
        durationMs: 0,
        tokenEstimate: 0,
        sortTime: ev.time,
        source: 'sse-permission',
        detail: safeDetail(ev.raw),
        row: actionRowForBand(0, 'Permission'),
      })
    } else if (ev.type === 'session.compacted') {
      out.push({
        actionType: 'Compaction',
        status: 'completed',
        durationMs: 600,
        tokenEstimate: 0,
        sortTime: ev.time,
        source: 'sse-session',
        detail: 'session.compacted',
        row: actionRowForBand(0, 'Compaction'),
      })
    }
  }
  return out
}

/** 合并 part 与 SSE 动作，按时间排序；SSE 项保持 row=1（无子任务上下文） */
export function mergeActions(
  fromMessages: (MappedAction & { row: number })[],
  fromSse: (MappedAction & { row: number })[],
): (MappedAction & { row: number })[] {
  return [...fromMessages, ...fromSse].sort((a, b) => a.sortTime - b.sortTime)
}