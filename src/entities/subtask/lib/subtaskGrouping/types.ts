import type { OcTodo } from '@/shared/types/opencode'

/**
 * - **planning**: no list yet → first list write; or prior snapshot all done → next todowrite (**includes** that message).
 * - **execution**: previous todowrite snapshot still has pending work → pure assistant up to the next todowrite (**excludes** both todowrite rows).
 * - **wrap_up**: last todowrite snapshot is all completed, yet more assistant output follows (closing reply).
 */
export type SubtaskPhase = 'planning' | 'execution' | 'wrap_up'

export interface AssistantSubtask {
  subtask_id: string
  phase: SubtaskPhase
  /** Segment-end todo list by phase: planning = trailing todowrite snapshot; execution = following todowrite; wrap_up = fallback */
  todos: OcTodo[]
  todosNewlyCompleted: OcTodo[]
  /**
   * Todo ids completed **inside this segment** (matches `todosNewlyCompleted`, not the full `todos` list).
   * Drives per-row highlights in the Todo panel; when empty, execution falls back to message highlighting.
   */
  linkedTodoIds: string[]
  /** User message indices at this subtask start — used to render UserRequest actions. */
  userMessageIndices: number[]
  assistantMessageIndices: number[]
}