import type { OcMessage } from '@/shared/types/opencode'
import type { AssistantSubtask } from '@/entities/subtask/lib/subtaskGrouping'

export function countPartsInMessages(messages: OcMessage[]): number {
  let n = 0
  for (const m of messages) {
    n += m.parts.length
  }
  return n
}

/** Subtask title: phase label → newly completed todos → first text line → fallback */
export function deriveSubtaskTitle(
  st: AssistantSubtask,
  messages: OcMessage[],
  displayIndex: number,
): string {
  if (st.phase === 'planning') {
    return 'Research & plan'
  }
  if (st.phase === 'wrap_up') {
    return 'Wrap-up & output'
  }
  if (st.todosNewlyCompleted.length > 0) {
    const first = st.todosNewlyCompleted[0]!
    const head = first.content.length > 36 ? `${first.content.slice(0, 36)}…` : first.content
    const more =
      st.todosNewlyCompleted.length > 1 ? ` +${st.todosNewlyCompleted.length - 1} more` : ''
    return `Done: ${head}${more}`
  }
  const firstIdx = st.assistantMessageIndices[0]
  if (firstIdx !== undefined) {
    const msg = messages[firstIdx]
    if (msg) {
      for (const p of msg.parts) {
        if (p.type === 'text' && p.text?.trim()) {
          const line = p.text.trim().split(/\n/)[0]!.slice(0, 44)
          return line.length >= 44 ? `${line}…` : line
        }
      }
    }
  }
  return `Subtask ${displayIndex + 1}`
}
