import type { CSSProperties, RefObject } from 'react'
import type { OcTodo } from '@/shared/types/opencode'
import type { CanonicalTodo, LatestTodowriteBatchProgress } from '@/entities/todo/lib/todoRegistry'

export interface TodoPanelProps {
  /** Latest merged list (open + still-listed completed) */
  latestActive: CanonicalTodo[]
  /** Completed items that left the active list (deduped by id) */
  archivedCompleted: CanonicalTodo[]
  /** Completion ratio for the freshest todowrite batch */
  latestTodowriteBatchProgress: LatestTodowriteBatchProgress | null
  highlightTodoIds?: Set<string> | null
  onTodoClick?: (todo: OcTodo) => void
  listScrollRef?: RefObject<HTMLDivElement | null>
  /** Increment when selecting a subtask — auto-expands relevant sections */
  todoPanelRevealGeneration?: number
}

/** Section header typography shared with completed counts */
export const sectionHeaderLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  letterSpacing: 0.2,
}
