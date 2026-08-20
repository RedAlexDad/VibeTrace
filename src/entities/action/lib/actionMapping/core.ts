import type {
  MappedAction,
  OcMessage,
  OcMessagePart,
} from '@/shared/types/opencode'
import { type AssistantSubtask } from '@/entities/subtask/lib/subtaskGrouping'
import { stripHarnessGuidanceForDisplay } from '@/shared/config/harnessGuidance'
import { actionKey } from '@/entities/action/lib/actionKey'
import { estimateTokensFromStrings } from './estimate'
import { actionRowForBand, type TaskChildDescriptor } from './layout'
import {
  durationForText,
  durationForTool,
  durationForReasoning,
  toolStatusToActionStatus,
  toolWallClockWindow,
} from './timing'
import {
  extractChildSessionIdFromToolPart,
  isSubagentToolName,
  mapToolToActionType,
  parseToolError,
} from './tooling'

function userMessageDisplayText(message: OcMessage): string {
  const partText = message.parts
    .filter((part): part is Extract<OcMessagePart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .filter(Boolean)
    .join('\n\n')
  const raw = partText || message.info.content || ''
  return stripHarnessGuidanceForDisplay(raw).trim()
}

/**
 * 从父会话消息中收集「已能解析出子 session」的 task/subagent 工具（去重 callID+child）。
 */
export function collectTaskChildDescriptors(messages: OcMessage[]): TaskChildDescriptor[] {
  const out: TaskChildDescriptor[] = []
  const seen = new Set<string>()
  messages.forEach((message) => {
    if (message.info.role !== 'assistant') return
    const baseTime = message.info.time?.created ?? 0
    message.parts.forEach((part, partIndex) => {
      if (part.type !== 'tool' || !isSubagentToolName(part.tool)) return
      const sid = extractChildSessionIdFromToolPart(part)
      if (!sid) return
      const key = `${part.callID}__${sid}`
      if (seen.has(key)) return
      seen.add(key)
      const input = part.state?.input
      const description =
        input &&
        typeof input === 'object' &&
        typeof (input as { description?: unknown }).description === 'string'
          ? String((input as { description: string }).description)
          : undefined
      out.push({
        callID: part.callID,
        childSessionID: sid,
        messageId: message.info.id,
        anchorSortTime: baseTime + partIndex * 0.001,
        description,
      })
    })
  })
  return out
}

/**
 * 将子会话 GET /message 的结果映射到独立进程带（`sessionBandIndex`：第 1 个子会话通常为 1，第 2 个为 2…）。
 */
export function buildChildSessionBranchActions(
  childMessages: OcMessage[],
  opts: {
    branchChildSessionID: string
    parentTaskCallID: string
    anchorSortTime: number
    /** 该子会话在垂直堆叠中的进程带序号（与主会话 0 区分） */
    sessionBandIndex: number
    nowMs?: number
  },
): (MappedAction & { row: number })[] {
  const inner = buildMappedActionsFromMessages(childMessages, {
    bandStart: opts.sessionBandIndex,
    nowMs: opts.nowMs,
  })
  if (inner.length === 0) return []
  const minT = Math.min(...inner.map((a) => a.sortTime))
  return inner.map((a, i) => ({
    ...a,
    sortTime: opts.anchorSortTime + 0.002 + (a.sortTime - minT) + i * 1e-9,
    source: 'child-session' as const,
    branchChildSessionID: opts.branchChildSessionID,
    parentTaskCallID: opts.parentTaskCallID,
  }))
}

export function buildMappedActionsFromMessages(
  messages: OcMessage[],
  options?: { bandStart?: number; nowMs?: number },
): (MappedAction & { row: number })[] {
  const out: (MappedAction & { row: number })[] = []
  const processBand = options?.bandStart ?? 0
  const nowMs = options?.nowMs ?? Date.now()
  const staleToolCallIDs = collectStaleToolCallIDs(messages)

  /** Each output `messageIndex` refers to the **`messages`** array passed here (`segmentMessages` in subtasks), not necessarily the global session list — correlate UI with `message.info.id`. */
  messages.forEach((message, messageIndex) => {
    const baseTime = message.info.time?.created ?? 0
    const mid = message.info.id

    if (message.info.role === 'user') {
      const text = userMessageDisplayText(message)
      const firstTextPart = message.parts.find((part) => part.type === 'text')
      out.push({
        actionType: 'UserRequest',
        status: 'completed',
        durationMs: Math.max(10, durationForText(text)),
        tokenEstimate: estimateTokensFromStrings(text),
        sortTime: baseTime,
        source: 'part',
        sessionID: message.info.sessionID,
        messageID: mid,
        partIndex: firstTextPart ? message.parts.indexOf(firstTextPart) : 0,
        messageIndex,
        partId: firstTextPart?.id,
        detail: text || '(empty)',
        row: actionRowForBand(processBand, 'UserRequest'),
      })
      return
    }

    if (message.info.role !== 'assistant') return

    message.parts.forEach((part, partIndex) => {
      const sortTime = baseTime + partIndex * 0.001
      const mapped = partToMappedAction(
        part,
        message,
        messageIndex,
        partIndex,
        sortTime,
        mid,
        nowMs,
        staleToolCallIDs,
      )
      if (!mapped) return

      const row = actionRowForBand(processBand, mapped.actionType)
      out.push({ ...mapped, row })
    })
  })

  return out
}

function partToMappedAction(
  part: OcMessagePart,
  message: OcMessage,
  messageIndex: number,
  partIndex: number,
  sortTime: number,
  messageID: string,
  nowMs: number,
  staleToolCallIDs: Set<string>,
): MappedAction | null {
  switch (part.type) {
    case 'reasoning': {
      const text = part.text ?? ''
      return {
        actionType: 'Think',
        status: 'completed',
        durationMs: durationForReasoning(part),
        tokenEstimate: estimateTokensFromStrings(text),
        sortTime,
        source: 'part',
        sessionID: message.info.sessionID,
        messageID,
        partIndex,
        messageIndex,
        partId: part.id,
        detail: text.slice(0, 80),
      }
    }
    case 'text': {
      const text = part.text ?? ''
      return {
        actionType: 'Response',
        status: 'completed',
        durationMs: durationForText(text),
        tokenEstimate: estimateTokensFromStrings(text),
        sortTime,
        source: 'part',
        sessionID: message.info.sessionID,
        messageID,
        partIndex,
        messageIndex,
        partId: part.id,
        detail: text.slice(0, 80),
      }
    }
    case 'compaction':
      return {
        actionType: 'Compaction',
        status: 'completed',
        durationMs: 400,
        tokenEstimate: estimateTokensFromStrings(part.text),
        sortTime,
        source: 'part',
        sessionID: message.info.sessionID,
        messageID,
        partIndex,
        messageIndex,
        partId: part.id,
      }
    case 'tool': {
      const mappedType = mapToolToActionType(part.tool)
      if (!mappedType) return null
      const inp = part.state?.input
      const inpStr = inp ? JSON.stringify(inp) : ''
      const outStr = part.state?.output ?? ''
      const errStr = part.state?.error ?? ''
      const parsedErr = parseToolError(errStr)
      const childSessionID = isSubagentToolName(part.tool)
        ? extractChildSessionIdFromToolPart(part)
        : undefined
      const parallelKey = part.callID || childSessionID
      const toolWindow = toolWallClockWindow(part, message, nowMs)
      const status = toolStatusToActionStatus(part, message, nowMs, staleToolCallIDs)
      return {
        actionType: mappedType,
        status,
        durationMs: durationForTool(part, message, nowMs),
        tokenEstimate: estimateTokensFromStrings(inpStr, outStr, errStr),
        sortTime,
        source: 'part',
        sessionID: message.info.sessionID,
        messageID,
        callID: part.callID,
        childSessionID,
        parallelKey,
        toolWindow,
        partIndex,
        messageIndex,
        partId: part.id,
        detail: part.tool,
        errorName: parsedErr.name,
        errorMessage:
          parsedErr.message ??
          (status === 'error' ? 'Tool did not finalize before next assistant turn.' : undefined),
      }
    }
    default:
      return null
  }
}

/**
 * `data-transcript-action-key` on bubbles — must match `actionKey(act)` embedded in flows for `bandStart` (main = 0).
 * `messageIndex` inside `MappedAction` is unused by `actionKey()`.
 */
export function transcriptAnchorKeyForPart(
  message: OcMessage,
  part: OcMessagePart,
  partIndex: number,
  nowMs: number,
  staleToolCallIDs: Set<string>,
  bandStart = 0,
): string | null {
  if (message.info.role !== 'assistant') return null
  const baseTime = message.info.time?.created ?? 0
  const sortTime = baseTime + partIndex * 0.001
  const mapped = partToMappedAction(
    part,
    message,
    0,
    partIndex,
    sortTime,
    message.info.id,
    nowMs,
    staleToolCallIDs,
  )
  if (!mapped) return null
  const row = actionRowForBand(bandStart, mapped.actionType)
  return actionKey({ ...mapped, row })
}

/**
 * Stable `actionKey` for the first flow block in a subtask card’s parent segment (same ordering as `SubtaskCard`’s
 * `buildMappedActionsFromMessages(segmentMessages)` before child-session merge). Skips `UserRequest` bubbles (user
 * column has no `data-transcript-action-key` yet).
 */
export function firstFlowAnchorKeyForSubtaskSegment(
  subtask: AssistantSubtask,
  messages: OcMessage[],
  nowMs: number,
): string | null {
  const indices = [...(subtask.userMessageIndices ?? []), ...subtask.assistantMessageIndices].sort(
    (a, b) => a - b,
  )
  const segmentMessages = indices.map((i) => messages[i]).filter((m): m is OcMessage => m != null)
  if (segmentMessages.length === 0) return null
  const actions = buildMappedActionsFromMessages(segmentMessages, { nowMs })
  if (actions.length === 0) return null
  const sorted = [...actions].sort((a, b) => a.sortTime - b.sortTime)
  const firstVisual = sorted.find((a) => a.actionType !== 'UserRequest') ?? sorted[0]
  if (!firstVisual) return null
  return actionKey(firstVisual)
}

/** 基于消息序列判定失效工具：若某 tool 仍 pending/running，但后续 assistant 消息已开始，则视为该 call 不会再回流结果。 */
export function collectStaleToolCallIDs(messages: OcMessage[]): Set<string> {
  const stale = new Set<string>()
  const assistantIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.info.role === 'assistant') assistantIndices.push(i)
  }
  if (assistantIndices.length <= 1) return stale

  for (let k = 0; k < assistantIndices.length - 1; k++) {
    const idx = assistantIndices[k]!
    const msg = messages[idx]!
    for (const p of msg.parts) {
      if (p.type !== 'tool') continue
      const s = p.state?.status
      if (s === 'running' || s === 'pending') {
        stale.add(p.callID)
      }
    }
  }
  return stale
}