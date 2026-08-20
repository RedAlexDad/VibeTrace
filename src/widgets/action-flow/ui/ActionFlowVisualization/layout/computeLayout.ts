import type { MappedAction } from '@/shared/types/opencode'
import { actionKey } from '@/entities/action/lib/actionKey'
import {
  BOTTOM_PAD,
  BLOCK_H,
  DUR_TAIL_PAD_PX,
  MARGIN_LEFT,
  MIN_SVG_CONTENT_HEIGHT,
  MIN_W,
  ROW_H,
  SESSION_REGION_GAP,
  TOP_PAD,
} from './constants'
import { blockWidth, durationGapWidthPx, durationStartOffsetPx } from './duration'
import { laneOffsetY } from './positions'
import { actionLocalRowForLayout, actionSessionKey, isNewBranchAction } from './sessionClassify'
import type { FlowLayoutItem, FlowNode } from './types'

export function computeLayout(
  actions: (MappedAction & { row: number })[],
  durationMode: boolean,
  layoutOpts?: {
    includeEndNode?: boolean
    forkAnchorActionKey?: string | null
  },
) {
  const includeEndNode = layoutOpts?.includeEndNode !== false
  const forkAnchorActionKey = layoutOpts?.forkAnchorActionKey ?? null
  const sorted = [...actions].sort((a, b) => a.sortTime - b.sortTime)

  /** Tighter step gap so sequential actions do not drift too far horizontally */
  const TIMELINE_STEP_GAP = 10

  const sessionKeySet = new Set<string>()
  sorted.forEach((a) => sessionKeySet.add(actionSessionKey(a)))

  /**
   * Fork-compare mode activates when any `forkCompareRow === 2` action exists — including the edge case
   * where the new branch only contains task / child-session work with no “primary lane” tooling.
   * `hasForkNewBranchSession` only checks whether `session:fork-new-branch` rows exist (whether to reserve a lane).
   */
  const hasNewBranchAction = sorted.some(isNewBranchAction)
  const hasForkNewBranchSession = sessionKeySet.has('session:fork-new-branch')

  /** Task child-session region → treat as new-branch task if the parent Subagent has `forkCompareRow === 2` */
  const isNewBranchTaskKey = (k: string): boolean => {
    if (!k.startsWith('session:task:')) return false
    const callID = k.slice('session:task:'.length)
    const parent = sorted.find(
      (a) => a.actionType === 'Subagent' && a.source !== 'child-session' && a.callID === callID,
    )
    if (parent) return parent.forkCompareRow === 2
    /** Fallback when the parent Subagent is missing from current data (shouldn’t happen — inspect child-session flags) */
    const anyAction = sorted.find((a) => actionSessionKey(a) === k)
    return anyAction?.forkCompareRow === 2
  }

  const sessionOrder: string[] = []
  if (sessionKeySet.has('session:main')) sessionOrder.push('session:main')

  /**
   * Fork-compare mode renders two parallel rails, each with its own terminator:
   *  - Legacy timeline (anchor + grey ghosts) → muted end node anchored to the main lane
   *  - New branch actions → standard end node anchored to the fork lane
   * Vanilla sessions still emit a single main end.
   * End nodes carry `sessionRegion` so layout can place x/y deterministically.
   */
  const seq: FlowNode[] = sorted.map((a) => ({ ...a, kind: 'action' as const }))
  if (includeEndNode) {
    seq.push({ kind: 'end', row: 1, sessionRegion: 'main' })
    if (hasNewBranchAction) {
      seq.push({ kind: 'end', row: 1, sessionRegion: 'fork-new-branch' })
    }
  }
  const childKeys = [...sessionKeySet].filter(
    (k) => k !== 'session:main' && k !== 'session:fork-new-branch',
  )
  const sortChildKeys = (keys: string[]) => {
    keys.sort((ka, kb) => {
      const actionsA = sorted.filter((a) => actionSessionKey(a) === ka)
      const actionsB = sorted.filter((a) => actionSessionKey(a) === kb)
      const ga = actionsA[0]?.parallelGroupId ?? ''
      const gb = actionsB[0]?.parallelGroupId ?? ''
      if (ga !== gb) return ga.localeCompare(gb)
      const la = actionsA[0]?.parallelLaneIndex ?? 0
      const lb = actionsB[0]?.parallelLaneIndex ?? 0
      if (la !== lb) return la - lb
      const minA = Math.min(...actionsA.map((x) => x.sortTime))
      const minB = Math.min(...actionsB.map((x) => x.sortTime))
      return minA - minB
    })
    return keys
  }
  /**
   * Lane order after fork:
   *   main (legacy anchor + ghosts)
   *   → historical task child regions (parents are legacy Subagents)
   *   → `session:fork-new-branch` (new-track non-task tooling)
   *   → new-branch task regions (parents live on the forked Subagent rail)
   * This keeps nested child sessions from interleaving legacy vs fork content; the fork stack reads as one block.
   */
  const historicalChildKeys = sortChildKeys(childKeys.filter((k) => !isNewBranchTaskKey(k)))
  const newBranchChildKeys = sortChildKeys(childKeys.filter((k) => isNewBranchTaskKey(k)))
  sessionOrder.push(...historicalChildKeys)
  if (hasForkNewBranchSession) sessionOrder.push('session:fork-new-branch')
  sessionOrder.push(...newBranchChildKeys)
  if (sessionOrder.length === 0) sessionOrder.push('session:main')

  /** Global canvas x positions (sorted index → x) */
  const actionXBySortedIndex = new Map<number, number>()

  /**
   * Root rail: every action that is neither `child-session` nor on the forked branch (legacy parent timeline).
   * Fork parents (`forkCompareRow === 2`, including forked Subagents) advance on a dedicated branch rail so they
   * never steal horizontal space from the historical spine.
   */
  const rootIndices = sorted
    .map((a, idx) => ({ a, idx }))
    .filter((x) => x.a.source !== 'child-session' && !isNewBranchAction(x.a))
    .map((x) => x.idx)

  /** Root rail slot ids (shared chronological axis) */
  const rootSlotByIndex = new Map<number, string>()
  const rootGroupStepToSlot = new Map<string, Map<number, string>>()
  const rootGroupLaneStepCounter = new Map<string, Map<number, number>>()
  const rootSlotIndices = new Map<string, number[]>()
  let nextRootSlot = 0
  for (const idx of rootIndices) {
    const a = sorted[idx]!
    let slotKey: string
    if (!a.parallelGroupId) {
      slotKey = `root:${nextRootSlot++}`
    } else {
      const session = actionSessionKey(a)
      const isParentTaskEntry =
        a.actionType === 'Subagent' && a.source !== 'child-session' && Boolean(a.callID)
      const groupKey = isParentTaskEntry ? a.parallelGroupId : `${session}::${a.parallelGroupId}`
      const lane = a.parallelLaneIndex ?? 0
      let laneCounter = rootGroupLaneStepCounter.get(groupKey)
      if (!laneCounter) {
        laneCounter = new Map<number, number>()
        rootGroupLaneStepCounter.set(groupKey, laneCounter)
      }
      const step = laneCounter.get(lane) ?? 0
      laneCounter.set(lane, step + 1)

      let stepSlots = rootGroupStepToSlot.get(groupKey)
      if (!stepSlots) {
        stepSlots = new Map<number, string>()
        rootGroupStepToSlot.set(groupKey, stepSlots)
      }
      if (!stepSlots.has(step)) stepSlots.set(step, `root:${nextRootSlot++}`)
      slotKey = stepSlots.get(step)!
    }
    rootSlotByIndex.set(idx, slotKey)
    let list = rootSlotIndices.get(slotKey)
    if (!list) {
      list = []
      rootSlotIndices.set(slotKey, list)
    }
    list.push(idx)
  }

  /**
   * Child-session local rails (relative offsets):
   * - Each child band advances independently;
   * - Track `childSpan` so parent task slots can stretch to encompass nested work.
   */
  const childLocalXByIndex = new Map<number, number>()
  const childSpanByCallID = new Map<string, number>()
  for (const childSession of childKeys) {
    const callID = childSession.slice('session:task:'.length)
    const childIndices = sorted
      .map((a, idx) => ({ a, idx }))
      .filter((x) => x.a.source === 'child-session' && actionSessionKey(x.a) === childSession)
      .map((x) => x.idx)
    if (childIndices.length === 0) {
      childSpanByCallID.set(callID, 0)
      continue
    }
    const childSlotByIndex = new Map<number, string>()
    const childSlotOffsetByIndex = new Map<number, number>()
    const childGroupStepToSlot = new Map<string, Map<number, string>>()
    const childGroupLaneStepCounter = new Map<string, Map<number, number>>()
    let nextChildSlot = 0
    for (const idx of childIndices) {
      const a = sorted[idx]!
      let slotKey: string
      if (!a.parallelGroupId) {
        slotKey = `child:${nextChildSlot++}`
      } else {
        const groupKey = a.parallelGroupId
        const lane = a.parallelLaneIndex ?? 0
        let laneCounter = childGroupLaneStepCounter.get(groupKey)
        if (!laneCounter) {
          laneCounter = new Map<number, number>()
          childGroupLaneStepCounter.set(groupKey, laneCounter)
        }
        const step = laneCounter.get(lane) ?? 0
        laneCounter.set(lane, step + 1)
        let stepSlots = childGroupStepToSlot.get(groupKey)
        if (!stepSlots) {
          stepSlots = new Map<number, string>()
          childGroupStepToSlot.set(groupKey, stepSlots)
        }
        if (!stepSlots.has(step)) stepSlots.set(step, `child:${nextChildSlot++}`)
        slotKey = stepSlots.get(step)!
      }
      childSlotByIndex.set(idx, slotKey)
    }

    const childSlotWidth = new Map<string, number>()
    /** Duration mode: wall-clock spans per child slot to derive idle gaps */
    const childSlotTimeRange = new Map<string, { minStart: number; maxEnd: number }>()
    for (const idx of childIndices) {
      const slotKey = childSlotByIndex.get(idx)
      if (!slotKey) continue
      const a = sorted[idx]!
      const w = blockWidth(durationMode, a.durationMs)
      childSlotWidth.set(slotKey, Math.max(childSlotWidth.get(slotKey) ?? 0, w))
      if (durationMode) {
        const cur = childSlotTimeRange.get(slotKey)
        childSlotTimeRange.set(slotKey, {
          minStart: Math.min(cur?.minStart ?? Infinity, a.sortTime),
          maxEnd: Math.max(cur?.maxEnd ?? -Infinity, a.sortTime + Math.max(0, a.durationMs)),
        })
      }
    }
    if (durationMode) {
      childSlotWidth.clear()
      for (const idx of childIndices) {
        const slotKey = childSlotByIndex.get(idx)
        if (!slotKey) continue
        const a = sorted[idx]!
        const range = childSlotTimeRange.get(slotKey)
        const dx = durationStartOffsetPx(range?.minStart ?? a.sortTime, a.sortTime)
        childSlotOffsetByIndex.set(idx, dx)
        childSlotWidth.set(
          slotKey,
          Math.max(childSlotWidth.get(slotKey) ?? 0, dx + blockWidth(durationMode, a.durationMs)),
        )
      }
    }
    const childSlotStartX = new Map<string, number>()
    let childCursor = 0
    for (let s = 0; s < nextChildSlot; s++) {
      const slotKey = `child:${s}`
      childSlotStartX.set(slotKey, childCursor)
      let interSlotGap = TIMELINE_STEP_GAP
      if (durationMode && s + 1 < nextChildSlot) {
        const nextKey = `child:${s + 1}`
        const thisRange = childSlotTimeRange.get(slotKey)
        const nextRange = childSlotTimeRange.get(nextKey)
        if (thisRange && nextRange) {
          const gapMs = Math.max(0, nextRange.minStart - thisRange.maxEnd)
          interSlotGap = durationGapWidthPx(gapMs)
        }
      }
      childCursor += (childSlotWidth.get(slotKey) ?? MIN_W) + interSlotGap
    }
    for (const idx of childIndices) {
      const slotKey = childSlotByIndex.get(idx)
      childLocalXByIndex.set(
        idx,
        (slotKey ? (childSlotStartX.get(slotKey) ?? 0) : 0) +
          (childSlotOffsetByIndex.get(idx) ?? 0),
      )
    }
    const lastChildGap = durationMode ? DUR_TAIL_PAD_PX : TIMELINE_STEP_GAP
    const childSpanRight = Math.max(0, childCursor - lastChildGap)
    childSpanByCallID.set(callID, childSpanRight)
  }

  /** Effective horizontal span per root slot: max(parent block, parent task→child-session footprint) */
  const rootSlotEffectiveSpan = new Map<string, number>()
  const rootSlotOffsetByIndex = new Map<number, number>()
  /** Duration mode: wall-clock ranges for each root slot (idle gap between slots) */
  const rootSlotTimeRange = new Map<string, { minStart: number; maxEnd: number }>()
  for (const [slotKey, indices] of rootSlotIndices.entries()) {
    let span = MIN_W
    let minStart = Infinity
    let maxEnd = -Infinity
    for (const idx of indices) {
      const a = sorted[idx]!
      const w = blockWidth(durationMode, a.durationMs)
      span = Math.max(span, w)
      if (a.actionType === 'Subagent' && a.source !== 'child-session' && a.callID) {
        const childSpan = childSpanByCallID.get(a.callID) ?? 0
        span = Math.max(span, w + TIMELINE_STEP_GAP + childSpan)
      }
      if (durationMode) {
        minStart = Math.min(minStart, a.sortTime)
        maxEnd = Math.max(maxEnd, a.sortTime + Math.max(0, a.durationMs))
      }
    }
    if (durationMode && Number.isFinite(minStart)) {
      rootSlotTimeRange.set(slotKey, { minStart, maxEnd })
    }
    if (durationMode && Number.isFinite(minStart)) {
      span = MIN_W
      for (const idx of indices) {
        const a = sorted[idx]!
        const dx = durationStartOffsetPx(minStart, a.sortTime)
        rootSlotOffsetByIndex.set(idx, dx)
        const w = blockWidth(durationMode, a.durationMs)
        span = Math.max(span, dx + w)
        if (a.actionType === 'Subagent' && a.source !== 'child-session' && a.callID) {
          const childSpan = childSpanByCallID.get(a.callID) ?? 0
          span = Math.max(span, dx + w + TIMELINE_STEP_GAP + childSpan)
        }
      }
    }
    rootSlotEffectiveSpan.set(slotKey, span)
  }

  const rootSlotStartX = new Map<string, number>()
  let rootCursor = MARGIN_LEFT
  for (let s = 0; s < nextRootSlot; s++) {
    const slotKey = `root:${s}`
    rootSlotStartX.set(slotKey, rootCursor)
    let interSlotGap = TIMELINE_STEP_GAP
    if (durationMode && s + 1 < nextRootSlot) {
      const nextKey = `root:${s + 1}`
      const thisRange = rootSlotTimeRange.get(slotKey)
      const nextRange = rootSlotTimeRange.get(nextKey)
      if (thisRange && nextRange) {
        const gapMs = Math.max(0, nextRange.minStart - thisRange.maxEnd)
        interSlotGap = durationGapWidthPx(gapMs)
      }
    }
    rootCursor += (rootSlotEffectiveSpan.get(slotKey) ?? MIN_W) + interSlotGap
  }
  for (const idx of rootIndices) {
    const slotKey = rootSlotByIndex.get(idx)
    if (!slotKey) continue
    actionXBySortedIndex.set(
      idx,
      (rootSlotStartX.get(slotKey) ?? MARGIN_LEFT) + (rootSlotOffsetByIndex.get(idx) ?? 0),
    )
  }

  /**
   * Post-fork branch rail: advances east from the fork anchor (+ gap), independent from the trunk axis.
   * Branch x must settle before aligning child-session x to the trailing edge of the forked Subagent.
   * - Shares the fork anchor’s starting x as post-anchor ghosts/new-branch divergence, vertically split into bands.
   * - Fallback to trunk right edge when no explicit anchor exists or ghosts are absent.
   */
  let forkBranchRight = MARGIN_LEFT
  if (hasNewBranchAction) {
    /** ① Resolve anchor’s right boundary on the trunk (anchors are historical rows with known root x). */
    let anchorRight: number | null = null
    if (forkAnchorActionKey) {
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i]!
        if (actionKey(a) === forkAnchorActionKey) {
          const x = actionXBySortedIndex.get(i)
          if (x != null) {
            const w = blockWidth(durationMode, a.durationMs)
            anchorRight = x + w
            /** If the anchor is a Subagent with a child session, branch rails must clear the child band to avoid overlay. */
            if (a.actionType === 'Subagent' && a.source !== 'child-session' && a.callID) {
              const childSpan = childSpanByCallID.get(a.callID) ?? 0
              if (childSpan > 0) anchorRight = x + w + TIMELINE_STEP_GAP + childSpan
            }
          }
          break
        }
      }
    }
    if (anchorRight == null) {
      /** Fallback: rightmost non-fork action on the trunk (including nested child spans). */
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i]!
        if (isNewBranchAction(a)) continue
        const x = actionXBySortedIndex.get(i)
        if (x == null) continue
        let r = x + blockWidth(durationMode, a.durationMs)
        if (a.actionType === 'Subagent' && a.source !== 'child-session' && a.callID) {
          const childSpan = childSpanByCallID.get(a.callID) ?? 0
          if (childSpan > 0)
            r = x + blockWidth(durationMode, a.durationMs) + TIMELINE_STEP_GAP + childSpan
        }
        if (anchorRight == null || r > anchorRight) anchorRight = r
      }
    }
    const forkBaseX = (anchorRight ?? MARGIN_LEFT) + TIMELINE_STEP_GAP

    /**
     * ② Branch indices = every `forkCompareRow === 2` action that is not `child-session`.
     *    Includes forked Subagents — they still key into `session:task:*` like pre-fork tasks,
     *    but must advance on the branch rail or they collide with historical slots.
     */
    const branchIndices = sorted
      .map((a, idx) => ({ a, idx }))
      .filter((x) => isNewBranchAction(x.a) && x.a.source !== 'child-session')
      .map((x) => x.idx)

    const branchSlotByIndex = new Map<number, string>()
    const branchSlotOffsetByIndex = new Map<number, number>()
    const branchSlotIndices = new Map<string, number[]>()
    const branchGroupStepToSlot = new Map<string, Map<number, string>>()
    const branchGroupLaneStepCounter = new Map<string, Map<number, number>>()
    let nextBranchSlot = 0
    for (const idx of branchIndices) {
      const a = sorted[idx]!
      let slotKey: string
      if (!a.parallelGroupId) {
        slotKey = `branch:${nextBranchSlot++}`
      } else {
        const groupKey = a.parallelGroupId
        const lane = a.parallelLaneIndex ?? 0
        let laneCounter = branchGroupLaneStepCounter.get(groupKey)
        if (!laneCounter) {
          laneCounter = new Map<number, number>()
          branchGroupLaneStepCounter.set(groupKey, laneCounter)
        }
        const step = laneCounter.get(lane) ?? 0
        laneCounter.set(lane, step + 1)
        let stepSlots = branchGroupStepToSlot.get(groupKey)
        if (!stepSlots) {
          stepSlots = new Map<number, string>()
          branchGroupStepToSlot.set(groupKey, stepSlots)
        }
        if (!stepSlots.has(step)) stepSlots.set(step, `branch:${nextBranchSlot++}`)
        slotKey = stepSlots.get(step)!
      }
      branchSlotByIndex.set(idx, slotKey)
      const arr = branchSlotIndices.get(slotKey) ?? []
      arr.push(idx)
      branchSlotIndices.set(slotKey, arr)
    }
    /** Branch-slot width must swallow nested forked Subagent sessions (same widening rule as the trunk rail). */
    const branchSlotEffectiveSpan = new Map<string, number>()
    /** Duration mode: per-branch-slot time span */
    const branchSlotTimeRange = new Map<string, { minStart: number; maxEnd: number }>()
    for (const [slotKey, indices] of branchSlotIndices.entries()) {
      let span = MIN_W
      let minStart = Infinity
      let maxEnd = -Infinity
      for (const idx of indices) {
        const a = sorted[idx]!
        const w = blockWidth(durationMode, a.durationMs)
        span = Math.max(span, w)
        if (a.actionType === 'Subagent' && a.source !== 'child-session' && a.callID) {
          const childSpan = childSpanByCallID.get(a.callID) ?? 0
          span = Math.max(span, w + TIMELINE_STEP_GAP + childSpan)
        }
        if (durationMode) {
          minStart = Math.min(minStart, a.sortTime)
          maxEnd = Math.max(maxEnd, a.sortTime + Math.max(0, a.durationMs))
        }
      }
      branchSlotEffectiveSpan.set(slotKey, span)
      if (durationMode && Number.isFinite(minStart)) {
        branchSlotTimeRange.set(slotKey, { minStart, maxEnd })
      }
      if (durationMode && Number.isFinite(minStart)) {
        span = MIN_W
        for (const idx of indices) {
          const a = sorted[idx]!
          const dx = durationStartOffsetPx(minStart, a.sortTime)
          branchSlotOffsetByIndex.set(idx, dx)
          const w = blockWidth(durationMode, a.durationMs)
          span = Math.max(span, dx + w)
          if (a.actionType === 'Subagent' && a.source !== 'child-session' && a.callID) {
            const childSpan = childSpanByCallID.get(a.callID) ?? 0
            span = Math.max(span, dx + w + TIMELINE_STEP_GAP + childSpan)
          }
        }
        branchSlotEffectiveSpan.set(slotKey, span)
      }
    }
    const branchSlotStartX = new Map<string, number>()
    let branchCursor = 0
    for (let s = 0; s < nextBranchSlot; s++) {
      const slotKey = `branch:${s}`
      branchSlotStartX.set(slotKey, branchCursor)
      let interSlotGap = TIMELINE_STEP_GAP
      if (durationMode && s + 1 < nextBranchSlot) {
        const nextKey = `branch:${s + 1}`
        const thisRange = branchSlotTimeRange.get(slotKey)
        const nextRange = branchSlotTimeRange.get(nextKey)
        if (thisRange && nextRange) {
          const gapMs = Math.max(0, nextRange.minStart - thisRange.maxEnd)
          interSlotGap = durationGapWidthPx(gapMs)
        }
      }
      branchCursor += (branchSlotEffectiveSpan.get(slotKey) ?? MIN_W) + interSlotGap
    }
    for (const idx of branchIndices) {
      const slotKey = branchSlotByIndex.get(idx)
      const localX = slotKey ? (branchSlotStartX.get(slotKey) ?? 0) : 0
      actionXBySortedIndex.set(idx, forkBaseX + localX + (branchSlotOffsetByIndex.get(idx) ?? 0))
    }
    const lastBranchGap = durationMode ? DUR_TAIL_PAD_PX : TIMELINE_STEP_GAP
    forkBranchRight = forkBaseX + Math.max(0, branchCursor - lastBranchGap)

    /**
     * Dual-rail synchronization: ghosts advance on trunk slots while the fork rail uses branch slots — two independent cursors.
     * Matching `TIMELINE_STEP_GAP` is not enough: differing `effectiveSpan` (duration or nested breadth) pushes ghost step k vs branch step k apart.
     *
     * Post-anchor unify: zip ghost-root slots with branch slots in order of appearance, force shared width = max(ghostSpan_k, branchSpan_k),
     * advance east from `forkBaseX`, rewriting `actionXBySortedIndex` for both rails. Absolute child-session x recomputes later from parent anchors.
     */
    const ghostRootSlots: { slotKey: string; firstSortTime: number }[] = []
    for (let s = 0; s < nextRootSlot; s++) {
      const slotKey = `root:${s}`
      const indices = rootSlotIndices.get(slotKey) ?? []
      if (indices.length === 0) continue
      if (indices.every((idx) => sorted[idx]!.forkGhost === true)) {
        let firstT = Infinity
        for (const idx of indices) {
          const t = sorted[idx]!.sortTime
          if (t < firstT) firstT = t
        }
        ghostRootSlots.push({ slotKey, firstSortTime: firstT })
      }
    }
    ghostRootSlots.sort((p, q) => p.firstSortTime - q.firstSortTime)

    const stepCount = Math.max(ghostRootSlots.length, nextBranchSlot)
    if (stepCount > 0) {
      let unifiedCursor = 0
      for (let k = 0; k < stepCount; k++) {
        let span = MIN_W
        if (k < ghostRootSlots.length) {
          span = Math.max(span, rootSlotEffectiveSpan.get(ghostRootSlots[k]!.slotKey) ?? MIN_W)
        }
        if (k < nextBranchSlot) {
          span = Math.max(span, branchSlotEffectiveSpan.get(`branch:${k}`) ?? MIN_W)
        }
        const stepX = forkBaseX + unifiedCursor
        if (k < ghostRootSlots.length) {
          const slotKey = ghostRootSlots[k]!.slotKey
          const indices = rootSlotIndices.get(slotKey) ?? []
          for (const idx of indices) {
            actionXBySortedIndex.set(idx, stepX + (rootSlotOffsetByIndex.get(idx) ?? 0))
          }
        }
        if (k < nextBranchSlot) {
          const slotKey = `branch:${k}`
          const indices = branchSlotIndices.get(slotKey) ?? []
          for (const idx of indices) {
            actionXBySortedIndex.set(idx, stepX + (branchSlotOffsetByIndex.get(idx) ?? 0))
          }
        }
        unifiedCursor += span + TIMELINE_STEP_GAP
      }
      forkBranchRight = forkBaseX + Math.max(0, unifiedCursor - TIMELINE_STEP_GAP)
    }
  }

  /**
   * Child-session absolute x = parent task trailing edge + gap + local offset inside the nested band.
   * **Runs after branch x assignment** — parent nodes on forks live on branch coordinates; otherwise lookups miss.
   */
  for (const childSession of childKeys) {
    const callID = childSession.slice('session:task:'.length)
    const parentIdx = sorted.findIndex(
      (a) => a.actionType === 'Subagent' && a.source !== 'child-session' && a.callID === callID,
    )
    if (parentIdx < 0) continue
    const parent = sorted[parentIdx]!
    const parentX = actionXBySortedIndex.get(parentIdx) ?? MARGIN_LEFT
    const parentRight = parentX + blockWidth(durationMode, parent.durationMs)
    const childBaseX = parentRight + TIMELINE_STEP_GAP
    const childIndices = sorted
      .map((a, idx) => ({ a, idx }))
      .filter((x) => x.a.source === 'child-session' && actionSessionKey(x.a) === childSession)
      .map((x) => x.idx)
    for (const idx of childIndices) {
      actionXBySortedIndex.set(idx, childBaseX + (childLocalXByIndex.get(idx) ?? 0))
    }
  }

  /**
   * Terminator x placement per fork rail:
   *  - Main: trunk cursor reaches the farthest legacy action (nested child timelines included).
   *  - `fork-new-branch`: branch cursor + slack (`forkBranchRight` already nests forked Subagent spans).
   */
  let historicalRightmost = rootCursor - TIMELINE_STEP_GAP
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!
    if (isNewBranchAction(a)) continue
    const x = actionXBySortedIndex.get(i)
    if (x == null) continue
    const r = x + blockWidth(durationMode, a.durationMs)
    if (r > historicalRightmost) historicalRightmost = r
  }
  const endXMain = historicalRightmost + TIMELINE_STEP_GAP
  const branchRightmost = sorted.reduce((maxR, a, idx) => {
    if (!isNewBranchAction(a)) return maxR
    const x = actionXBySortedIndex.get(idx)
    if (x == null) return maxR
    return Math.max(maxR, x + blockWidth(durationMode, a.durationMs))
  }, MARGIN_LEFT)
  const endXForkBranch = hasNewBranchAction
    ? durationMode
      ? branchRightmost + TIMELINE_STEP_GAP
      : forkBranchRight + TIMELINE_STEP_GAP
    : endXMain

  const sessionTopY = new Map<string, number>()
  let sessionY = TOP_PAD
  for (const session of sessionOrder) {
    sessionTopY.set(session, sessionY)
    const local = sorted.filter((a) => actionSessionKey(a) === session)
    let maxBottom = BLOCK_H
    for (const a of local) {
      /** Within-session y comes from kernel/tool row plus parallel lanes; forks already split via `sessionTopY`. */
      const yInSession = actionLocalRowForLayout(a) * ROW_H + laneOffsetY(a.parallelLaneIndex)
      maxBottom = Math.max(maxBottom, yInSession + BLOCK_H)
    }
    sessionY += maxBottom + SESSION_REGION_GAP
  }
  const totalH = Math.max(
    sessionY - SESSION_REGION_GAP + BOTTOM_PAD,
    TOP_PAD + BLOCK_H + BOTTOM_PAD,
    MIN_SVG_CONTENT_HEIGHT,
  )

  const layout: FlowLayoutItem[] = []

  for (let i = 0; i < seq.length; i++) {
    const node = seq[i]!
    if (node.kind === 'end') {
      const w = MIN_W
      /**
       * Each fork rail anchors its terminator on the lane’s first toolbar row:
       *  - `sessionRegion='main'` — legacy terminator (solo mode / ghost closure)
       *  - `sessionRegion='fork-new-branch'` — new-track terminator
       */
      const isForkEnd = node.sessionRegion === 'fork-new-branch'
      const xNode = isForkEnd ? endXForkBranch : endXMain
      const regionKey = isForkEnd ? 'session:fork-new-branch' : 'session:main'
      const y = sessionTopY.get(regionKey) ?? sessionTopY.get('session:main') ?? TOP_PAD
      const cy = y + BLOCK_H / 2
      layout.push({ node, x: xNode, y, w, h: BLOCK_H, cx: xNode + w / 2, cy })
    } else {
      const a = node as MappedAction & { row: number }
      const w = blockWidth(durationMode, a.durationMs)
      const xNode = actionXBySortedIndex.get(i) ?? MARGIN_LEFT
      const session = actionSessionKey(a)
      const yBase = sessionTopY.get(session) ?? TOP_PAD
      /** Matches sessionTopY base without legacy `forkCompareRow * FORK_COMPARE_ROW_GAP` bumps */
      const y = yBase + actionLocalRowForLayout(a) * ROW_H + laneOffsetY(a.parallelLaneIndex)
      const cy = y + BLOCK_H / 2
      layout.push({ node, x: xNode, y, w, h: BLOCK_H, cx: xNode + w / 2, cy })
    }
  }

  const maxActionRight = sorted.reduce((maxR, a, idx) => {
    const x = actionXBySortedIndex.get(idx) ?? MARGIN_LEFT
    const w = blockWidth(durationMode, a.durationMs)
    return Math.max(maxR, x + w)
  }, MARGIN_LEFT)
  const totalTimelineRight = includeEndNode
    ? Math.max(maxActionRight, endXMain + MIN_W, endXForkBranch + MIN_W)
    : maxActionRight
  const totalW = Math.max(totalTimelineRight + MARGIN_LEFT, 360)
  return { layout, totalW, totalH }
}
