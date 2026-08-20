import type { MappedAction } from '@/shared/types/opencode'

/**
 * Vertical stacking of logical sessions / lanes (evaluation order matters):
 * 1. `session:task:<parentTaskCallID>` — child-session actions or parent-side Subagents with `childSessionID`
 *    collapse into matching child-session bands. Fork rules mirror before/after branching.
 * 2. `session:fork-new-branch` — non-task actions on the new branch lane after a fork (`forkCompareRow === 2`),
 *    laid out west-to-east starting at the fork anchor and drawn below legacy regions.
 * 3. `session:main` — everything else belonging to the main process before/for non-fork views.
 *
 * Always classify child-session / Subagent routing before evaluating `forkCompareRow`, otherwise
 * new-branch task nodes may be mis-labeled into `fork-new-branch` bands and visually detach from children.
 */
export function actionSessionKey(a: MappedAction & { row: number }): string {
  if (a.source === 'child-session' && a.parentTaskCallID) {
    return `session:task:${a.parentTaskCallID}`
  }
  if (a.actionType === 'Subagent' && a.source !== 'child-session' && a.callID && a.childSessionID) {
    return `session:task:${a.callID}`
  }
  if (a.forkCompareRow === 2) {
    return 'session:fork-new-branch'
  }
  return 'session:main'
}

/** Whether this action sits on the post-fork “new branch” track (still includes nested tasks/sub-sessions); marked via `forkCompareRow === 2`. */
export function isNewBranchAction(a: MappedAction & { row: number }): boolean {
  return a.forkCompareRow === 2
}

/** Parent tasks remain layer1 in payloads; inside child-session **bands** force first row rendering (fresh session headline). */
export function actionLocalRowForLayout(a: MappedAction & { row: number }): number {
  if (a.actionType === 'Subagent' && a.source !== 'child-session' && a.callID && a.childSessionID) {
    return 0
  }
  return Math.max(0, a.row % 2)
}
