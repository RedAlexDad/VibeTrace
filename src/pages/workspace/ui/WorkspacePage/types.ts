import type { MappedAction, OcTodo } from '@/shared/types/opencode'
import type { ForkFromActionContext } from '@/features/fork-session/model/forkPanelSnapshot'

/** Map: message index containing a todo write → todos captured at that instant (for replaying diffs) */
export type TodosSnapshotMap = Record<string, OcTodo[]>

/** Fork workflow: prompt → capture subtask panel snapshot → call OpenCode fork */
export type PendingFork = {
  action: MappedAction & { row: number }
  forkCtx?: ForkFromActionContext
}
