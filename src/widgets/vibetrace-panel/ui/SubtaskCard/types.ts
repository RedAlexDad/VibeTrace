import type { MappedAction, OcMessage } from '@/shared/types/opencode'
import type { AssistantSubtask } from '@/entities/subtask/lib/subtaskGrouping'
import type {
  ForkFromActionContext,
  ForkPanelSnapshotBundle,
} from '@/features/fork-session/model/forkPanelSnapshot'
import type { ActionTypePaletteId } from '@/shared/styles/actionTypePalettes'

export type ColorByMode = 'tokens' | 'type'
export type FilterMode = 'duration' | 'tokens'

export const fontSans =
  "'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"

/** Minimum card height; grows with richer content such as fork comparison */
export const CARD_MIN_HEIGHT = 220
export const LONG_RUNNING_MS = 60_000

export interface SubtaskCardProps {
  subtask: AssistantSubtask
  messages: OcMessage[]
  displayIndex: number
  /** DOM index for connectors/scroll — must match `linkedSubtaskIndex` in App */
  cardIndex?: number
  isLinked?: boolean
  onSelectSubtask?: () => void
  onForkFromAction?: (action: MappedAction & { row: number }, ctx: ForkFromActionContext) => void
  onAnalyzeFromAction?: (action: MappedAction & { row: number }) => void
  /** Required when fetching child sessions with multi-directory OpenCode */
  sessionDirectory?: string
  /** Forked session: local read-only snapshot for comparison (not in model context) */
  forkPanelSnapshotBundle?: ForkPanelSnapshotBundle | null
  /** Selected action type — highlight same type in ActionFlow (reserved; no UI entry yet) */
  selectedActionType?: string | null
  /** Selected action key — takes precedence over `selectedActionType` */
  selectedActionKey?: string | null
  /** When another subtask holds the selection, dim every action in this card */
  otherSubtaskHasSelection?: boolean
  /** ActionFlow rect click */
  onSelectActionFromFlow?: (actionKey: string | null) => void
  /** Shared coloring mode controlled by parent subtask panel */
  colorBy: ColorByMode
  onColorByChange: (mode: ColorByMode) => void
  /** Shared action-type palette from parent panel */
  actionTypePaletteId: ActionTypePaletteId
  /** Scrolls the chat transcript to the very last message */
  onScrollToLatestChat?: () => void
}
