import type { OcPendingQuestionItem } from '@/shared/types/opencode'

/** One row for the composer dropdown (`ref` is always `providerID/modelID`). */
export interface OcComposerModelOption {
  ref: string
  label: string
}

export type UserMessagePartBody =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      source: { type: string; media_type: string; data: string }
    }

/** Loose shape of a global SSE event object (payload may be nested or the event itself). */
export interface GlobalSseEvent {
  type?: string
  properties?: Record<string, unknown>
  payload?: GlobalSseEvent
  directory?: string
}

/** Optional endpoints may answer with the raw list or a wrapper `{ data|items|pending|result }`. */
export function normalizePendingQuestionList(raw: unknown): OcPendingQuestionItem[] {
  if (Array.isArray(raw)) return raw as OcPendingQuestionItem[]
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    for (const k of ['data', 'items', 'pending', 'result']) {
      const v = o[k]
      if (Array.isArray(v)) return v as OcPendingQuestionItem[]
    }
  }
  return []
}