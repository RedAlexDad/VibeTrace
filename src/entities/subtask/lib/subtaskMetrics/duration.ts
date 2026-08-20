import type { OcMessage } from '@/shared/types/opencode'

/** End time for one assistant message: `completed`, or extends to `now` while tools are running/pending. */
function assistantMessageEndMs(msg: OcMessage, nowMs: number): number {
  const c = msg.info.time.created
  let e = msg.info.time.completed ?? c
  for (const p of msg.parts) {
    if (p.type !== 'tool') continue
    const st = p.state?.status
    if (st !== 'running' && st !== 'pending') continue
    const start = p.state?.time?.start ?? c
    if (typeof start === 'number' && Number.isFinite(start)) {
      e = Math.max(e, nowMs)
    }
  }
  return e
}

/**
 * Subtask duration: split into **contiguous** assistant index runs on the global timeline;
 * sum each run's first `created` → last end. Gaps while waiting on the user are **excluded**.
 */
export function computeSubtaskDurationExcludingUserGaps(
  assistantIndices: number[],
  allMessages: OcMessage[],
  nowMs: number,
): number | null {
  if (assistantIndices.length === 0) return null
  const sorted = [...new Set(assistantIndices)].sort((a, b) => a - b)
  const chunks: number[][] = []
  let cur: number[] = [sorted[0]!]
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const idx = sorted[i]!
    if (idx === prev + 1) {
      cur.push(idx)
    } else {
      chunks.push(cur)
      cur = [idx]
    }
  }
  chunks.push(cur)

  let sum = 0
  for (const chunk of chunks) {
    const msgs = chunk.map((i) => allMessages[i]).filter((m): m is OcMessage => m != null)
    if (msgs.length === 0) continue
    let minCreated = Infinity
    let maxEnd = -Infinity
    for (const m of msgs) {
      const c = m.info.time.created
      const e = assistantMessageEndMs(m, nowMs)
      minCreated = Math.min(minCreated, c)
      maxEnd = Math.max(maxEnd, e)
    }
    if (Number.isFinite(minCreated) && maxEnd >= minCreated) {
      sum += maxEnd - minCreated
    }
  }
  return sum > 0 ? sum : null
}

/** Subtask duration label (em dash when unknown) */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`
  const m = Math.floor(s / 60)
  const rs = Math.round(s - m * 60)
  return `${m}m${rs > 0 ? `${rs}s` : ''}`
}