import type { OcMessage, OcMessagePart } from '@/shared/types/opencode'
import type { AssistantSubtask } from '@/entities/subtask/lib/subtaskGrouping'
import { computeSubtaskDurationExcludingUserGaps } from './duration'
import { collectMutatedPathsFromMessages, collectReadFileStatsFromMessages } from './files'
import { estimateCostUsdFromTokenBreakdown, tokenTotalForMessage } from './tokens'
import { countPartsInMessages, deriveSubtaskTitle } from './title'
import type { SubtaskCardMetrics, SubtaskTokenBreakdown } from './types'
import { collectWebSearchQueriesFromMessages } from './web'

export function buildSubtaskCardMetrics(
  st: AssistantSubtask,
  messages: OcMessage[],
  displayIndex: number,
  options?: {
    nowMs?: number
    /** Child session messages (task/subagent): merged into Changes (write/edit paths). */
    additionalMessages?: OcMessage[]
  },
): SubtaskCardMetrics {
  const indices = st.assistantMessageIndices
  const msgs = indices.map((i) => messages[i]).filter((m): m is OcMessage => !!m)

  const bd: SubtaskTokenBreakdown = {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  }

  let tokensSegmentSum = 0
  for (const m of msgs) {
    const t = m.info.tokens
    if (t) {
      bd.input += t.input ?? 0
      bd.output += t.output ?? 0
      bd.reasoning += t.reasoning ?? 0
      bd.cacheRead += t.cache?.read ?? 0
      bd.cacheWrite += t.cache?.write ?? 0
    }
    tokensSegmentSum += tokenTotalForMessage(m.info.tokens)
  }
  bd.total = bd.input + bd.output + bd.reasoning + bd.cacheRead + bd.cacheWrite

  let costSegmentSum = 0
  for (const m of msgs) {
    const c = m.info.cost
    if (typeof c === 'number' && Number.isFinite(c)) {
      costSegmentSum += c
    }
  }
  const costEstimatedUsd = estimateCostUsdFromTokenBreakdown(bd)

  const paths = new Set<string>()
  collectMutatedPathsFromMessages(msgs, paths)
  if (options?.additionalMessages?.length) {
    collectMutatedPathsFromMessages(options.additionalMessages, paths)
  }
  const mutatedFilePaths = [...paths].sort()

  const allForRead: OcMessage[] = [...msgs, ...(options?.additionalMessages ?? [])]
  const readStats = collectReadFileStatsFromMessages(allForRead)
  const readFilePaths = readStats.readPathsSorted
  const globMatchFileCount = readStats.globFileHits
  const readFilesCount = readFilePaths.length + globMatchFileCount
  const webSearchQueries = collectWebSearchQueriesFromMessages(allForRead)
  const webSearchCallCount = webSearchQueries.length

  const nowMs = options?.nowMs ?? Date.now()
  const durationMs = computeSubtaskDurationExcludingUserGaps(indices, messages, nowMs)

  return {
    title: deriveSubtaskTitle(st, messages, displayIndex),
    assistantMessageIndices: [...indices],
    partCount: countPartsInMessages(msgs),
    tokensSegmentSum,
    tokenBreakdown: bd,
    llmCallCount: msgs.length,
    mutatedFilePaths,
    mutatedFileCount: mutatedFilePaths.length,
    readFilesCount,
    readFilePaths,
    globMatchFileCount,
    webSearchQueries,
    webSearchCallCount,
    durationMs,
    costSegmentSum,
    costEstimatedUsd,
    todosResolvedCount: st.todosNewlyCompleted.length,
  }
}

/** Message + part refs for this subtask (for downstream visualization). */
export function getSubtaskMessagesAndParts(
  st: AssistantSubtask,
  messages: OcMessage[],
): { messageIndex: number; message: OcMessage; parts: OcMessagePart[] }[] {
  return st.assistantMessageIndices
    .map((i) => {
      const message = messages[i]
      if (!message) return null
      return { messageIndex: i, message, parts: message.parts }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
}

export { countUserMessagesInSubtaskWindow } from './window'
export { formatDurationMs } from './duration'
export { formatSubtaskCostDisplay } from './tokens'