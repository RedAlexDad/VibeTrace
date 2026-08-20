import type { OcMessage } from '@/shared/types/opencode'

/**
 * Number of user messages between the assistant after the previous subtask window and this subtask's last assistant index.
 */
export function countUserMessagesInSubtaskWindow(
  messages: OcMessage[],
  assistantIndices: number[],
  prevSubtaskMaxAssistantIndex: number | null | undefined,
): number {
  if (assistantIndices.length === 0) return 0
  const maxA = Math.max(...assistantIndices)
  const start = prevSubtaskMaxAssistantIndex == null ? 0 : prevSubtaskMaxAssistantIndex + 1
  let n = 0
  for (let i = start; i <= maxA; i++) {
    if (messages[i]?.info.role === 'user') n++
  }
  return n
}