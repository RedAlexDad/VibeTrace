import type { ActionStatus, OcMessage, ToolPart } from '@/shared/types/opencode'
import { estimateTokensFromStrings } from './estimate'

export function durationForReasoning(part: {
  time?: { start?: number; end?: number }
  text?: string
}): number {
  const { start, end } = part.time ?? {}
  if (typeof start === 'number' && typeof end === 'number' && end >= start) {
    if (end > start) return Math.max(10, end - start)
    /** 常见：流式里 start/end 未区分，同为瞬时点；不应回退到 token*40（会把 Think 拉成 30s 假时长） */
    return 10
  }
  return Math.min(30_000, Math.max(0, estimateTokensFromStrings(part.text) * 40))
}

export function durationForTool(part: ToolPart, message: OcMessage, nowMs: number): number {
  const st = part.state?.status
  if (st === 'running' || st === 'pending') {
    const start = part.state?.time?.start ?? message.info.time?.created
    if (typeof start === 'number' && Number.isFinite(start)) {
      return Math.max(0, nowMs - start)
    }
    return 0
  }
  const start = part.state?.time?.start
  const end = part.state?.time?.end
  if (typeof start === 'number' && typeof end === 'number' && end > start) {
    return Math.max(10, end - start)
  }
  const created = message.info.time?.created ?? 0
  const completed = message.info.time?.completed
  if (typeof completed === 'number' && completed > created) {
    return Math.max(10, completed - created)
  }
  const out = part.state?.output ?? ''
  const inp = part.state?.input
  const inpStr = inp ? JSON.stringify(inp) : ''
  return Math.max(10, 80 + estimateTokensFromStrings(out, inpStr) * 30)
}

/** 工具 wall-clock 区间，用于并行重叠判定（与 duration 语义一致） */
export function toolWallClockWindow(
  part: ToolPart,
  message: OcMessage,
  nowMs: number,
): { startMs: number; endMs: number } | undefined {
  const st = part.state?.status
  let start = part.state?.time?.start
  if (typeof start !== 'number' || !Number.isFinite(start)) {
    const created = message.info.time?.created
    if (typeof created !== 'number' || !Number.isFinite(created)) return undefined
    start = created
  }
  const end = part.state?.time?.end
  if (typeof end === 'number' && end >= start) return { startMs: start, endMs: end }
  if (st === 'running' || st === 'pending') return { startMs: start, endMs: nowMs }
  return { startMs: start, endMs: start + 1 }
}

export function durationForText(text: string): number {
  return Math.max(50, 50 + text.length * 15)
}

export function toolStatusToActionStatus(
  part: ToolPart,
  message: OcMessage,
  nowMs: number,
  staleToolCallIDs: Set<string>,
): ActionStatus {
  void message
  void nowMs
  const s = part.state?.status
  if (s === 'error') return 'error'
  if (staleToolCallIDs.has(part.callID)) return 'error'
  if (s === 'running' || s === 'pending') {
    return 'running'
  }
  return 'completed'
}
