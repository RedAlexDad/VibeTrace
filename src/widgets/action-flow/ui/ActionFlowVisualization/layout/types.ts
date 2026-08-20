import type { MappedAction, OcMessage } from '@/shared/types/opencode'
import type { ActionTypePaletteId } from '@/shared/styles/actionTypePalettes'

export type FlowNode =
  | { kind: 'end'; row: number; sessionRegion: 'main' | 'fork-new-branch' }
  | (MappedAction & { row: number; kind: 'action' })

/** Single item from `computeLayout`, used when bundling connector edges */
export type FlowLayoutItem = {
  node: FlowNode
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
}

export type FlowEndSummary = {
  /** read path list count + glob match count */
  readFileTotalCount: number
  readFilePaths: string[]
  globMatchFileCount: number
  webSearchCount: number
  webSearchQueries: string[]
  writeFileCount: number
  changedFilePaths: string[]
}

export interface Props {
  actions: (MappedAction & { row: number })[]
  durationMode: boolean
  colorMode: 'status' | 'tokens' | 'type'
  /**
   * Duration emphasis: keep full opacity while `durationMs >= durationHighlightMinMs`;
   * shorter actions fade (independent of color mode).
   */
  durationHighlightMinMs?: number | null
  /** Token emphasis: keep opacity while `tokenEstimate >= tokenHighlightMin`. */
  tokenHighlightMin?: number | null
  /** When thresholds apply, auto-scroll to first matching block (default true). */
  autoScrollFirstFilteredMatch?: boolean
  /**
   * Message table backing tooltips: merge of `segmentMessages` + `childBranchMessages`
   * (see `mergeMessagesForActionTooltipLookup`) so `partId` aligns with rects.
   */
  tooltipMessages?: OcMessage[]
  onForkFromAction?: (action: MappedAction & { row: number }) => void
  onAnalyzeFromAction?: (action: MappedAction & { row: number }) => void
  /** Mock-data only: synthetically split the flow at an action index */
  mockBranchForkActionIndex?: number
  /**
   * When false, skip the closing end node (still useful while tools are running/pending).
   * Defaults to true.
   */
  showFlowEndNode?: boolean
  /** Hover HTML for the terminator; pair with `showFlowEndNode`. */
  flowEndSummary?: FlowEndSummary
  /** Drop inner chrome when embedded inside split containers */
  embedded?: boolean
  /** Cap scroll area height (px) for stacked lanes */
  viewportMaxHeight?: number
  /**
   * Hide scrollbars via CSS while keeping wheel scrolling. Default false — shows native overflow affordance.
   */
  hideScrollbar?: boolean
  /** Type-level highlight: matching groups stay bright, others fade. */
  highlightedActionType?: string | null
  /**
   * Action-level highlight (single `actionKey`), higher priority than type mode.
   */
  highlightedActionKey?: string | null
  /** Dim the entire flow while another subtask owns focus */
  dimAll?: boolean
  /** Rectangle click toggles action-level selection */
  onSelectAction?: (actionKey: string | null) => void
  /**
   * Fork-compare: pass the anchor `actionKey()` for `forkCompareRow === 2` rows — layout allocates a branch rail east of the anchor with dedicated drop edges.
   */
  forkAnchorActionKey?: string | null
  /** Palette id when `colorMode === 'type'` */
  actionTypePaletteId?: ActionTypePaletteId
}
