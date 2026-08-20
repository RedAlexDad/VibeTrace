import type { OcMessage, OcTodo } from '@/shared/types/opencode'
import { cloneTodo, diffTodosNewlyCompleted, parseTodowriteTodosFromMessage } from './todo'
import type { AssistantSubtask, SubtaskPhase } from './types'

/**
 * Subtask id stays stable as more assistant turns append (keyed by the first assistant message id in the segment)
 * so we do not treat continuations as brand-new subtasks. User messages only open a new range; inside the range
 * segmentation is still driven by todowrite completion diffs.
 */
function buildSubtaskId(indices: number[], messages: OcMessage[]): string {
  if (indices.length === 0) return 'subtask-empty'
  const first = indices[0]!
  const last = indices[indices.length - 1]!
  const head = messages[first]!
  if (head.info.id && head.info.id.length > 0) {
    return `subtask-${head.info.id}`
  }
  return `subtask-idx-${first}-${last}`
}

function resolveSnapshotForSegment(
  lastIdx: number,
  messages: OcMessage[],
  lastTodowriteSnapshot: OcTodo[] | null,
  resolver: ((index: number) => OcTodo[] | undefined) | undefined,
  fallback: OcTodo[],
  canonicalAt?: (index: number) => OcTodo[] | undefined,
): OcTodo[] {
  const c = canonicalAt?.(lastIdx)
  if (c !== undefined && c.length > 0) {
    return c.map(cloneTodo)
  }
  const lastMsg = messages[lastIdx]!
  const fromTool = parseTodowriteTodosFromMessage(lastMsg)
  if (fromTool && fromTool.length > 0) {
    return fromTool.map(cloneTodo)
  }
  const r = resolver?.(lastIdx)
  if (r !== undefined && r.length > 0) {
    return r.map(cloneTodo)
  }
  if (lastTodowriteSnapshot && lastTodowriteSnapshot.length > 0) {
    return lastTodowriteSnapshot.map(cloneTodo)
  }
  return fallback.map(cloneTodo)
}

/**
 * Split assistant indices by user turns: a user ends the prior segment and seeds the next UserRequest action.
 * Todo snapshot completion rules still refine segments inside each range.
 */
function assistantRangesSplitByUser(
  messages: OcMessage[],
): Array<{ assistantIndices: number[]; userMessageIndices: number[] }> {
  const out: Array<{ assistantIndices: number[]; userMessageIndices: number[] }> = []
  let pendingUsers: number[] = []
  let currentAssistants: number[] = []
  const flush = () => {
    if (currentAssistants.length === 0) return
    out.push({
      assistantIndices: currentAssistants,
      userMessageIndices: pendingUsers,
    })
    currentAssistants = []
    pendingUsers = []
  }
  for (let i = 0; i < messages.length; i++) {
    const role = messages[i]!.info.role
    if (role === 'user') {
      flush()
      pendingUsers.push(i)
    } else if (role === 'assistant') {
      currentAssistants.push(i)
    }
  }
  flush()
  return out
}

function collectIndicesInclusive(range: number[], lo: number, hi: number): number[] {
  const out: number[] = []
  for (const idx of range) {
    if (idx >= lo && idx <= hi) out.push(idx)
  }
  return out
}

/** Non-empty list and every item is completed */
function allTodosCompleted(s: OcTodo[]): boolean {
  return s.length > 0 && s.every((t) => t.status === 'completed')
}

/**
 * Todo ids newly completed in **this segment** only — Todo panel highlights these rows instead of every item in the snapshot.
 */
function linkedTodoIdsForHighlight(newly: OcTodo[]): string[] {
  const s = new Set<string>()
  for (const t of newly) {
    if (t.id?.trim()) s.add(t.id.trim())
  }
  return [...s]
}

export function groupAssistantSubtasks(
  messages: OcMessage[],
  options?: {
    todosAfterMessageIndex?: (index: number) => OcTodo[] | undefined
    /** Canonical todo list assigned at each message index — wins over raw tool parsing */
    canonicalTodosAtMessageIndex?: (index: number) => OcTodo[] | undefined
    fallbackSessionTodos?: OcTodo[]
  },
): AssistantSubtask[] {
  const resolver = options?.todosAfterMessageIndex
  const canonicalAt = options?.canonicalTodosAtMessageIndex
  const fallback = (options?.fallbackSessionTodos ?? []).map(cloneTodo)

  const subtasks: AssistantSubtask[] = []

  const ranges = assistantRangesSplitByUser(messages)
  if (ranges.length === 0) return subtasks

  for (const { assistantIndices: range, userMessageIndices } of ranges) {
    const rangeSubtasks: AssistantSubtask[] = []

    const push = (indices: number[], phase: SubtaskPhase, todos: OcTodo[], newly: OcTodo[]) => {
      if (indices.length === 0) return
      const td = todos.map(cloneTodo)
      const nw = newly.map(cloneTodo)
      const isFirstSubtaskInRange = rangeSubtasks.length === 0
      rangeSubtasks.push({
        subtask_id: buildSubtaskId(indices, messages),
        phase,
        todos: td,
        todosNewlyCompleted: nw,
        linkedTodoIds: linkedTodoIdsForHighlight(nw),
        userMessageIndices: isFirstSubtaskInRange ? [...userMessageIndices] : [],
        assistantMessageIndices: indices,
      })
    }

    const twIndices: number[] = []
    for (const idx of range) {
      const list = parseTodowriteTodosFromMessage(messages[idx]!)
      if (list && list.length > 0) twIndices.push(idx)
    }

    if (twIndices.length === 0) {
      push([...range], 'planning', fallback, [])
      subtasks.push(...rangeSubtasks)
      continue
    }

    /**
     * Subtask splits: completion-driven within a user-scoped assistant range.
     * - After the first todowrite we enter execution and keep accumulating.
     * - pending → in_progress does **not** cut a new segment.
     * - Only when a todowrite snapshot diff shows newly completed items do we close the segment at that tw row.
     * - The next segment starts at the following assistant index (extra user rows inside the range do not change this rule).
     */
    let lastTodowriteSnapshot: OcTodo[] | null = null
    const snapAtTw = new Map<number, OcTodo[]>()
    for (const idx of twIndices) {
      const snap = resolveSnapshotForSegment(
        idx,
        messages,
        lastTodowriteSnapshot,
        resolver,
        fallback,
        canonicalAt,
      )
      snapAtTw.set(idx, snap)
      lastTodowriteSnapshot = snap
    }

    let segmentStart = twIndices[0]!
    const firstAssistant = range[0]!
    if (segmentStart > firstAssistant) {
      const leading = collectIndicesInclusive(range, firstAssistant, segmentStart - 1)
      if (leading.length > 0) {
        push(leading, 'planning', fallback, [])
      }
    }

    for (let k = 1; k < twIndices.length; k++) {
      const prevTw = twIndices[k - 1]!
      const curTw = twIndices[k]!
      const prevSnap = snapAtTw.get(prevTw)!
      const curSnap = snapAtTw.get(curTw)!
      const newly = diffTodosNewlyCompleted(prevSnap, curSnap)
      if (newly.length === 0) continue

      const indices = collectIndicesInclusive(range, segmentStart, curTw)
      push(indices, 'execution', curSnap, newly)
      segmentStart = curTw + 1
    }

    const endOfRange = range[range.length - 1]!
    const trailing = collectIndicesInclusive(range, segmentStart, endOfRange)
    if (trailing.length > 0) {
      const lastTw = twIndices[twIndices.length - 1]!
      const snapLast = snapAtTw.get(lastTw) ?? fallback
      const phase: SubtaskPhase = allTodosCompleted(snapLast) ? 'wrap_up' : 'execution'
      push(trailing, phase, snapLast, [])
    }

    subtasks.push(...rangeSubtasks)
  }

  return subtasks
}

export function getAssistantSubtaskIndexForMessage(
  subtasks: AssistantSubtask[],
  messageIndex: number,
): number {
  return subtasks.findIndex((s) => s.assistantMessageIndices.includes(messageIndex))
}
