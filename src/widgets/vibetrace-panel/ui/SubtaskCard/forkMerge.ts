import type { MappedAction, OcMessage } from '@/shared/types/opencode'
import type { ForkPanelSnapshotBundle } from '@/features/fork-session/model/forkPanelSnapshot'
import { actionKey } from '@/entities/action/lib/actionKey'

export interface ForkMergedFlow {
  merged: (MappedAction & { row: number })[]
  mergedTooltips: OcMessage[]
  anchorActionKey: string
  sessionActions: (MappedAction & { row: number })[]
}

/**
 * After fork: one SVG merges shared pre-fork prefix + gray ghost after the anchor + the new branch.
 *
 * Fork-pre actions belong to the new OpenCode session context (messages are copied on fork) and already
 * live in `flowActions`. Pre-fork plus the live branch therefore reuse the **same** action objects so
 * treemap, tooltip, and selection state stay consistent. Only post-anchor “hypothetical old branch” steps
 * come from the snapshot ghost stream (absent in the forked session timeline).
 *
 * Fallback: when the new session omits copied pre-fork turns, treat the entire snapshot prefix as pre-fork.
 */
export function buildForkMergedFlow({
  forkPanelSnapshotBundle,
  subtaskId,
  displayIndex,
  flowActions,
  tooltipLookupMessages,
}: {
  forkPanelSnapshotBundle: ForkPanelSnapshotBundle | null | undefined
  subtaskId: string
  displayIndex: number
  flowActions: (MappedAction & { row: number })[]
  tooltipLookupMessages: OcMessage[]
}): ForkMergedFlow | null {
  if (!forkPanelSnapshotBundle || forkPanelSnapshotBundle.version !== 2) return null
  const b = forkPanelSnapshotBundle
  if (b.forkOriginSubtaskId !== subtaskId && b.forkOriginDisplayIndex !== displayIndex) {
    return null
  }
  const anchorMessageId = b.forkAnchorMessageId
  const anchorPartId = b.forkAnchorPartId
  const matchAnchor = (a: MappedAction & { row: number }) =>
    a.messageID === anchorMessageId && (anchorPartId ? a.partId === anchorPartId : true)

  const oldActions = b.snapshot.flowActions
  const oldAnchorIdx = oldActions.findIndex(matchAnchor)
  /** Anchor must resolve inside the snapshot; otherwise skip merged mode */
  if (oldAnchorIdx < 0) return null

  /** Prefer locating the anchor inside the live session so treemap/selection share object identity */
  const currentAnchorIdx = flowActions.findIndex(matchAnchor)

  let preForkAndAnchor: (MappedAction & { row: number })[]
  let postAnchorCurrent: (MappedAction & { row: number })[]
  if (currentAnchorIdx >= 0) {
    preForkAndAnchor = flowActions.slice(0, currentAnchorIdx + 1)
    postAnchorCurrent = flowActions.slice(currentAnchorIdx + 1)
  } else {
    /** Fallback when forked session lacks copied history — treat snapshot prefix as canonical */
    preForkAndAnchor = oldActions.slice(0, oldAnchorIdx + 1)
    postAnchorCurrent = flowActions
  }

  const anchorActionKey = actionKey(preForkAndAnchor[preForkAndAnchor.length - 1]!)
  /** Live-session semantic stream: prefix + post-anchor branch */
  const sessionActions = [...preForkAndAnchor, ...postAnchorCurrent].sort(
    (x, y) => x.sortTime - y.sortTime,
  )

  /** Old branch tail from snapshot — mark `forkGhost` */
  const ghostSuffix = oldActions.slice(oldAnchorIdx + 1).map((a) => ({ ...a, forkGhost: true }))

  /** Forked trajectory after anchor — tag `forkCompareRow = 2` */
  const newBranch = postAnchorCurrent.map((a) => ({ ...a, forkCompareRow: 2 as const }))

  const merged = [...preForkAndAnchor, ...ghostSuffix, ...newBranch].sort(
    (x, y) => x.sortTime - y.sortTime,
  )
  const mergedTooltips = [...b.snapshot.tooltipMessages, ...tooltipLookupMessages]
  return { merged, mergedTooltips, anchorActionKey, sessionActions }
}