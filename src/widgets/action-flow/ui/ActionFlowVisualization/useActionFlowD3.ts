import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { MappedAction } from '@/shared/types/opencode'
import { buildCompactMappedActionTooltipHtml } from '@/entities/action/lib/actionTooltipMapping'
import { actionFlowPalette } from '@/shared/styles/actionFlowPalette'
import { DEFAULT_ACTION_TYPE_PALETTE_ID } from '@/shared/styles/actionTypePalettes'
import {
  effectiveStatusColors,
  resolveActionBlockColors,
  statusColors,
} from '@/entities/action/lib/actionFlowColors'
import {
  appendActionFlowIcon,
  getActionFlowIconSvg,
} from '@/widgets/action-flow/ui/actionFlowIcons'
import type { ActionFlowContextMenuState } from '@/widgets/action-flow/ui/ActionFlowContextMenu'
import { actionKey } from '@/entities/action/lib/actionKey'
import { usePrefersDark } from '@/shared/lib/hooks/usePrefersDark'
import { computeLayout } from './layout/computeLayout'
import { blockWidth, formatDurationMs } from './layout/duration'
import {
  appendOrthoEdge,
  appendOrthoFanIn,
  appendOrthoFanOut,
  edgeStrokeAndMarker,
  parallelSiblingSkip,
} from './layout/edges'
import { buildFlowEndTooltipHtml } from './layout/flowEndTooltip'
import { rowTopY, verticalCenterOffsetY } from './layout/positions'
import { actionSessionKey, isNewBranchAction } from './layout/sessionClassify'
import {
  BLOCK_H,
  FORK_GHOST_MARKER_FILL,
  FORK_GHOST_STROKE,
  GAP,
  ROW_H,
  SVG_FONT_SANS,
} from './layout/constants'
import type { FlowLayoutItem, Props } from './layout/types'

export function useActionFlowD3({
  actions,
  durationMode,
  colorMode,
  durationHighlightMinMs = null,
  tokenHighlightMin = null,
  autoScrollFirstFilteredMatch = true,
  tooltipMessages,
  onForkFromAction,
  onAnalyzeFromAction,
  mockBranchForkActionIndex,
  showFlowEndNode = true,
  flowEndSummary,
  embedded = false,
  viewportMaxHeight,
  highlightedActionType = null,
  highlightedActionKey = null,
  dimAll = false,
  onSelectAction,
  forkAnchorActionKey = null,
  actionTypePaletteId = DEFAULT_ACTION_TYPE_PALETTE_ID,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [contextMenu, setContextMenu] = useState<ActionFlowContextMenuState | null>(null)
  const prefersDark = usePrefersDark()
  const reactId = useId().replace(/:/g, '')
  const markerId = `action-flow-arrow-${reactId}`
  const tooltipId = `action-flow-tip-${reactId}`
  /**
   * react-tooltip v5 performs its initial DOM scan inside `useEffect` (after paint) while D3 renders in `useLayoutEffect`.
   * In practice tooltip’s `[anchorsBySelect, activeAnchor]` handler fires right after scanning, resetting observers;
   * if the mouse already hovers during that teardown window `mouseenter` may never register.
   * Mount tooltips after the first paint batch so anchors exist before the observer spins up.
   */
  const [tooltipMounted, setTooltipMounted] = useState(false)
  useEffect(() => {
    setTooltipMounted(true)
  }, [])
  const layoutEstimate = useMemo(
    () =>
      computeLayout(actions, durationMode, {
        includeEndNode: showFlowEndNode,
        forkAnchorActionKey,
      }),
    [actions, durationMode, showFlowEndNode, forkAnchorActionKey],
  )

  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const root = d3.select(svg)
    root.selectAll('*').remove()

    const maxTok = Math.max(1, ...actions.map((a) => a.tokenEstimate))
    const colorScale = d3.scaleSequential(d3.interpolateBlues).domain([0, maxTok])

    const { layout, totalW, totalH } = computeLayout(actions, durationMode, {
      includeEndNode: showFlowEndNode,
      forkAnchorActionKey,
    })
    /** Fork compare when any forked-branch action appears (tasks included). Cannot rely solely on `session:fork-new-branch` because forked Subagents still key child sessions differently. */
    const hasForkNewBranchInLayout = layout.some(
      (item) =>
        item.node.kind === 'action' &&
        isNewBranchAction(item.node as MappedAction & { row: number }),
    )
    const offsetY = verticalCenterOffsetY(layout, totalH)
    const durationFilterActive =
      durationHighlightMinMs != null && Number.isFinite(durationHighlightMinMs)
    const tokenFilterActive = tokenHighlightMin != null && Number.isFinite(tokenHighlightMin)
    const filterMode = durationFilterActive ? 'duration' : tokenFilterActive ? 'tokens' : null

    const defs = root.append('defs')
    defs
      .append('marker')
      .attr('id', markerId)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', actionFlowPalette.arrow)

    const markerUrl = `url(#${markerId})`
    const ghostMarkerId = `action-flow-arrow-ghost-${reactId}`
    const ghostMarkerUrl = `url(#${ghostMarkerId})`
    defs
      .append('marker')
      .attr('id', ghostMarkerId)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', FORK_GHOST_MARKER_FILL)

    const canMockFork =
      typeof mockBranchForkActionIndex === 'number' &&
      mockBranchForkActionIndex >= 0 &&
      mockBranchForkActionIndex < actions.length
    const extraTopRows = canMockFork ? 1 : 0
    const topOffset = extraTopRows * ROW_H

    const content = root.append('g').attr('transform', `translate(0, ${offsetY + topOffset})`)
    const contentNode = content.node() as SVGGElement | null
    const edgeExists = (fromKey: string, toKey: string): boolean => {
      if (!contentNode) return false
      const esc = (s: string) =>
        typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"')
      return Boolean(
        contentNode.querySelector(
          `path.afv-edge[data-from-key="${esc(fromKey)}"][data-to-key="${esc(toKey)}"]`,
        ),
      )
    }

    /** Skip sequential segments already handled inside `appendOrthoFanIn`. */
    const parallelJoinSkip = new Set<string>()
    /** Parallel fan-outs render via `appendOrthoFanOut` — omit duplicates from primary loop */
    const parallelFanOutSkip = new Set<string>()

    /** Parallel bundles: intra-lane links, predecessor→lane heads, tails→successor (merged fan-in/out). */
    const groupIdToIndices = new Map<string, number[]>()
    for (let i = 0; i < layout.length; i++) {
      const item = layout[i]!
      if (item.node.kind !== 'action') continue
      const act = item.node as MappedAction & { row: number }
      const gid = act.parallelGroupId
      if (!gid) continue
      let arr = groupIdToIndices.get(gid)
      if (!arr) {
        arr = []
        groupIdToIndices.set(gid, arr)
      }
      arr.push(i)
    }
    for (const indices of groupIdToIndices.values()) {
      if (indices.length < 2) continue
      const groupActions = indices.map((idx) => ({
        idx,
        node: layout[idx]!.node as MappedAction & { row: number },
      }))
      const groupMinT = Math.min(...groupActions.map((g) => g.node.sortTime))
      const groupMaxT = Math.max(...groupActions.map((g) => g.node.sortTime))
      const indexSet = new Set(indices)

      /**
       * Which session hosts parallel predecessors/successors.
       *
       * Parallel Subagent rects key `session:task:callID` even though predecessors live in `session:main`.
       * Filtering strictly by the group session would drop real edges — only one adjacent edge would survive.
       *
       * Resolution:
       * - Subagent originating outside child sessions → search `'session:main'` (nested parents use parentTask anchors)
       * - Parallel actions inside child sessions → `'session:task:<parentTaskCallID>'`
       * - Ordinary main-band actions → `actionSessionKey`
       *
       * Still respect fork partitions (ghost vs new-branch) separately.
       */
      const firstNode = groupActions[0]!.node
      const groupIsGhost = firstNode.forkGhost === true
      const groupIsNewBranch = isNewBranchAction(firstNode)

      /** Session owning pred/succ search */
      const groupSearchSession: string = (() => {
        if (
          firstNode.actionType === 'Subagent' &&
          firstNode.source !== 'child-session' &&
          firstNode.callID &&
          firstNode.childSessionID
        ) {
          return 'session:main'
        }
        return actionSessionKey(firstNode)
      })()

      /** Fork boundary predicate for this parallel bundle */
      const passForkBoundary = (na: MappedAction & { row: number }): boolean => {
        if (groupIsGhost) return na.forkGhost === true
        if (groupIsNewBranch) return isNewBranchAction(na)
        return na.forkGhost !== true && !isNewBranchAction(na)
      }

      let predItem: (typeof layout)[0] | undefined
      let predIdx = -1
      for (let i = 0; i < layout.length; i++) {
        if (indexSet.has(i)) continue
        const it = layout[i]!
        if (it.node.kind !== 'action') continue
        const na = it.node as MappedAction & { row: number }
        if (actionSessionKey(na) !== groupSearchSession) continue
        if (!passForkBoundary(na)) continue
        if (na.sortTime < groupMinT) {
          predItem = it
          predIdx = i
        }
      }

      let succItem: (typeof layout)[0] | undefined
      let succIdx = -1
      for (let i = 0; i < layout.length; i++) {
        if (indexSet.has(i)) continue
        const it = layout[i]!
        if (it.node.kind !== 'action') continue
        const na = it.node as MappedAction & { row: number }
        if (actionSessionKey(na) !== groupSearchSession) continue
        if (!passForkBoundary(na)) continue
        if (na.sortTime > groupMaxT) {
          succItem = it
          succIdx = i
          break
        }
      }
      if (succIdx < 0) {
        /**
         * When no explicit successor exists, wire each bundle to its matching terminator:
         *  - Vanilla mode: lone `session:main` end
         *  - Fork compare: main bundle → ghost end, fork bundle → fork end
         */
        for (let i = 0; i < layout.length; i++) {
          if (indexSet.has(i)) continue
          const it = layout[i]!
          if (it.node.kind !== 'end') continue
          const endRegion =
            it.node.sessionRegion === 'fork-new-branch' ? 'session:fork-new-branch' : 'session:main'
          const targetEndRegion = groupIsNewBranch ? 'session:fork-new-branch' : 'session:main'
          if (endRegion === targetEndRegion) {
            succItem = it
            succIdx = i
            break
          }
        }
      }

      const byLane = new Map<number, number[]>()
      for (const idx of indices) {
        const act = layout[idx]!.node as MappedAction & { row: number }
        const lane = act.parallelLaneIndex ?? 0
        let list = byLane.get(lane)
        if (!list) {
          list = []
          byLane.set(lane, list)
        }
        list.push(idx)
      }

      const firstIndices: number[] = []
      const lastIndices: number[] = []
      for (const laneIndices of byLane.values()) {
        const sortedIdx = [...laneIndices].sort((a, b) => {
          const ta = (layout[a]!.node as MappedAction & { row: number }).sortTime
          const tb = (layout[b]!.node as MappedAction & { row: number }).sortTime
          return ta - tb
        })
        /** Intra-lane sequential connectors */
        for (let i = 0; i < sortedIdx.length - 1; i++) {
          const fromIdx = sortedIdx[i]!
          const toIdx = sortedIdx[i + 1]!
          const na = layout[fromIdx]!.node as MappedAction & { row: number }
          const nb = layout[toIdx]!.node as MappedAction & { row: number }
          const { stroke: forkStroke, markerUrl: forkMarker } = edgeStrokeAndMarker(
            na,
            nb,
            markerUrl,
            ghostMarkerUrl,
          )
          appendOrthoEdge(
            content,
            layout[fromIdx]!.x + layout[fromIdx]!.w,
            layout[fromIdx]!.cy,
            layout[toIdx]!.x,
            layout[toIdx]!.cy,
            forkMarker,
            forkStroke,
            1.2,
          )
        }
        firstIndices.push(sortedIdx[0]!)
        lastIndices.push(sortedIdx[sortedIdx.length - 1]!)
      }

      /**
       * Fan-out predecessor → lane heads via `appendOrthoFanOut`, register each pred→first skip token for the sequential pass.
       */
      if (predItem && predIdx >= 0 && firstIndices.length > 0) {
        for (const fi of firstIndices) {
          parallelFanOutSkip.add(`${predIdx}-${fi}`)
        }
        appendOrthoFanOut(
          content,
          predItem,
          firstIndices.map((fi) => layout[fi]!),
          markerUrl,
          ghostMarkerUrl,
        )
      }

      /** Fan-in lane tails → successor using shared bundle column */
      if (succItem && succIdx >= 0 && lastIndices.length > 0) {
        for (const li of lastIndices) {
          parallelJoinSkip.add(`${li}-${succIdx}`)
        }
        appendOrthoFanIn(
          content,
          lastIndices.map((idx) => layout[idx]!),
          layout[succIdx]!,
          markerUrl,
          ghostMarkerUrl,
        )
      }
    }

    /**
     * Post-fork rails (ghost tails vs forked timeline) interleave sortTime — sequential adjacency is unsafe.
     * `connectPostAnchorTrack` restores edges by scanning each rail independently.
     */
    const isPostAnchor = (a: MappedAction & { row: number }) =>
      a.forkGhost === true || isNewBranchAction(a)

    for (let i = 0; i < layout.length - 1; i++) {
      const a = layout[i]!
      const b = layout[i + 1]!
      if (a.node.kind === 'action' && b.node.kind === 'action') {
        const pa = a.node as MappedAction & { row: number }
        const pb = b.node as MappedAction & { row: number }
        /**
         * Skip sequential neighbors between rails after the fork anchor — mis-paired adjacency skips true successors (`connectPostAnchorTrack` redraws separately).
         */
        if (isPostAnchor(pa) && isPostAnchor(pb)) continue
        /**
         * Skip pseudo-adjacency across legacy ghosts vs fork branch (anchor linkage handled explicitly).
         */
        const aIsNewBranch = isNewBranchAction(pa)
        const bIsNewBranch = isNewBranchAction(pb)
        if (aIsNewBranch !== bIsNewBranch) continue
        if (
          pa.actionType === 'Subagent' &&
          pa.childSessionID &&
          pa.callID &&
          pb.source === 'child-session' &&
          pb.parentTaskCallID === pa.callID &&
          pb.branchChildSessionID === pa.childSessionID
        ) {
          continue
        }
        if (parallelSiblingSkip(pa, pb)) continue
      }
      if (parallelJoinSkip.has(`${i}-${i + 1}`)) continue
      if (parallelFanOutSkip.has(`${i}-${i + 1}`)) continue
      /**
       * Skip implicit hops into terminator nodes — dedicated closing pass attaches each lane’s trailing action correctly.
       */
      if (b.node.kind === 'end') continue
      const x1 = a.x + a.w
      const y1 = a.cy
      const x2 = b.x
      const y2 = b.cy
      const mid = (x1 + x2) / 2
      const path = d3.path()
      path.moveTo(x1, y1)
      path.lineTo(mid, y1)
      path.lineTo(mid, y2)
      path.lineTo(x2, y2)
      const { stroke: segStroke, markerUrl: segMarker } =
        a.node.kind === 'action' && b.node.kind === 'action'
          ? edgeStrokeAndMarker(
              a.node as MappedAction & { row: number },
              b.node as MappedAction & { row: number },
              markerUrl,
              ghostMarkerUrl,
            )
          : { stroke: actionFlowPalette.arrow, markerUrl }
      const fromKey =
        a.node.kind === 'action' ? actionKey(a.node as MappedAction & { row: number }) : null
      const toKey =
        b.node.kind === 'action' ? actionKey(b.node as MappedAction & { row: number }) : null
      const p = content
        .append('path')
        .attr('class', 'afv-edge')
        .attr('d', path.toString())
        .attr('fill', 'none')
        .attr('stroke', segStroke)
        .attr('stroke-width', 1.2)
        .attr('marker-end', segMarker)
        .attr('pointer-events', 'none')
      if (fromKey) p.attr('data-from-key', fromKey)
      if (toKey) p.attr('data-to-key', toKey)
    }

    /**
     * Stitch same-rail actions post-fork sorted by `sortTime`.
     * - Ghost stack (`forkGhost`) vs fork stack (`forkCompareRow === 2`) stay independent.
     * - Inside a rail ignore session distinctions (reads like pre-fork Main→Subagent flow).
     * - Skip purple Subagent→child entry edges, intra-parallel siblings, and fan-in pairs already routed.
     */
    const connectPostAnchorTrack = (predicate: (a: MappedAction & { row: number }) => boolean) => {
      const indices: number[] = []
      for (let i = 0; i < layout.length; i++) {
        const it = layout[i]!
        if (it.node.kind !== 'action') continue
        if (!predicate(it.node as MappedAction & { row: number })) continue
        indices.push(i)
      }
      indices.sort((p, q) => {
        const ta = (layout[p]!.node as MappedAction & { row: number }).sortTime
        const tb = (layout[q]!.node as MappedAction & { row: number }).sortTime
        return ta - tb
      })
      for (let k = 0; k < indices.length - 1; k++) {
        const i = indices[k]!
        const j = indices[k + 1]!
        const ai = layout[i]!
        const bi = layout[j]!
        const pa = ai.node as MappedAction & { row: number }
        const pb = bi.node as MappedAction & { row: number }
        if (
          pa.actionType === 'Subagent' &&
          pa.childSessionID &&
          pa.callID &&
          pb.source === 'child-session' &&
          pb.parentTaskCallID === pa.callID &&
          pb.branchChildSessionID === pa.childSessionID
        ) {
          continue
        }
        if (parallelSiblingSkip(pa, pb)) continue
        if (parallelJoinSkip.has(`${i}-${j}`)) continue
        const { stroke, markerUrl: m } = edgeStrokeAndMarker(pa, pb, markerUrl, ghostMarkerUrl)
        appendOrthoEdge(
          content,
          ai.x + ai.w,
          ai.cy,
          bi.x,
          bi.cy,
          m,
          stroke,
          1.2,
          actionKey(pa),
          actionKey(pb),
        )
      }
    }
    connectPostAnchorTrack((a) => a.forkGhost === true)
    connectPostAnchorTrack(isNewBranchAction)

    layout.forEach((item, layoutIndex) => {
      const { node, x: nx, y: ny, w, h } = item
      if (node.kind === 'end') {
        /**
         * Ghost terminator (`sessionRegion='main'` with active fork rails) renders neutral grey;
         * forked / baseline ends keep `palette.end` yellow. Omit summary tooltip on ghosts (current-session data mismatch).
         */
        const isGhostEnd = node.sessionRegion === 'main' && hasForkNewBranchInLayout
        const fill = isGhostEnd ? 'var(--color-border-light)' : actionFlowPalette.end.fill
        const stroke = isGhostEnd ? 'var(--color-text-muted)' : actionFlowPalette.end.stroke
        const endTip = !isGhostEnd && flowEndSummary ? buildFlowEndTooltipHtml(flowEndSummary) : ''
        const circle = content
          .append('circle')
          .attr('cx', nx + w / 2)
          .attr('cy', ny + h / 2)
          .attr('r', h / 2 - 2)
          .attr('fill', fill)
          .attr('stroke', stroke)
          .attr('stroke-width', 1.5)
          .style('cursor', endTip ? 'pointer' : 'default')
        if (endTip) {
          circle
            .attr('data-tooltip-id', tooltipId)
            .attr('data-tooltip-html', endTip)
            .attr('data-tooltip-place', 'left')
        }
        return
      }

      const act = node as MappedAction & { row: number }
      const isGhost = act.forkGhost === true
      const isUserRequest = act.actionType === 'UserRequest'
      const matchesHighlight =
        filterMode === null
          ? true
          : filterMode === 'duration'
            ? !Number.isFinite(act.durationMs) ||
              act.durationMs >= (durationHighlightMinMs as number)
            : !Number.isFinite(act.tokenEstimate) ||
              act.tokenEstimate >= (tokenHighlightMin as number)
      const sc = effectiveStatusColors(act.status, act.durationMs)
      const { fill, iconFill } = resolveActionBlockColors(
        act,
        colorMode,
        colorScale,
        actionTypePaletteId,
      )

      let stateOutlineStroke = 'none'
      let stateOutlineStrokeW = 0
      if (!isGhost && !isUserRequest) {
        if (act.status === 'running' || act.status === 'pending') {
          stateOutlineStroke = statusColors(act.status).stroke
          stateOutlineStrokeW = 1.75
        }
      }

      /** Each action mounts a `<g>` with tooltip + dim metadata keyed by action type/key */
      const ak = actionKey(act)
      const actionG = content
        .append('g')
        .attr('class', 'afv-action')
        .attr('data-action-type', act.actionType)
        .attr('data-action-key', ak)
        .style('opacity', '1')
      const actionTarget = (isUserRequest
        ? actionG
            .append('circle')
            .attr('cx', nx + w / 2)
            .attr('cy', ny + h / 2)
            .attr('r', Math.max(5, Math.min(w, h) / 2 - 3))
            .attr('fill', 'transparent')
            .attr('stroke', iconFill)
            .attr('stroke-width', 2)
        : actionG
            .append('rect')
            .attr('x', nx)
            .attr('y', ny)
            .attr('width', w)
            .attr('height', h)
            .attr('rx', Math.max(1.5, Math.min(4, Math.min(w, h) * 0.22)))
            .attr('fill', fill)
            .attr('stroke', stateOutlineStroke)
            .attr('stroke-width', stateOutlineStrokeW)) as unknown as d3.Selection<
        SVGGraphicsElement,
        unknown,
        null,
        undefined
      >
      actionTarget
        .style('cursor', 'pointer')
        /**
         * `UserRequest` uses a hollow circle — default hit-testing ignores transparent interiors, breaking tooltips centered on the ring.
         */
        .attr('pointer-events', 'all')
        .attr('data-tooltip-id', tooltipId)
        .attr(
          'data-tooltip-html',
          buildCompactMappedActionTooltipHtml(act, tooltipMessages, formatDurationMs),
        )
        .attr('data-tooltip-place', 'top')
      if (onSelectAction) {
        actionTarget.on('click', (ev: MouseEvent) => {
          ev.stopPropagation()
          onSelectAction(ak)
        })
      }
      /** Persist filter dim flags so reused DOM nodes do not flicker stale opacity */
      actionG.attr('data-filter-dim', matchesHighlight ? '0' : '1')
      const canContext =
        act.messageID && (onForkFromAction || onAnalyzeFromAction) && act.forkGhost !== true
      const actionTargetEl = actionTarget.node() as SVGGraphicsElement
      if (canContext) {
        actionTarget.on('contextmenu', (ev: Event) => {
          ev.preventDefault()
          ev.stopPropagation()
          setContextMenu({ anchorRect: actionTargetEl.getBoundingClientRect(), action: act })
        })
      }

      if (!isGhost && !isUserRequest && (act.status === 'running' || act.status === 'pending')) {
        actionTarget.attr(
          'class',
          sc.isLongRunning ? 'action-flow-running-long' : 'action-flow-running',
        )
      }

      const actionGNode = actionG.node() as SVGGElement | null
      const iconBox = 16
      const canShowIcon = !isUserRequest
      if (actionGNode && canShowIcon) {
        appendActionFlowIcon(
          actionGNode,
          getActionFlowIconSvg(act.actionType),
          nx + w / 2,
          ny + h / 2,
          iconFill,
          `${reactId}-${layoutIndex}-`,
          iconBox,
        )
      }
      /** Duration mode: stamp readable duration inside wide blocks (> legacy 60 s badges) */
      if (durationMode && !isGhost && w >= 52 && act.durationMs > 0) {
        actionG
          .append('text')
          .attr('x', nx + 6)
          .attr('y', ny + 10)
          .attr('font-size', 9)
          .attr('font-weight', 600)
          .attr('fill', 'var(--color-text-secondary)')
          .attr('font-family', SVG_FONT_SANS)
          .text(formatDurationMs(act.durationMs))
          .attr('pointer-events', 'none')
      }

      /** Omit inline “⋯” menus per product decision */
    })

    /**
     * Explicit terminator wiring: each end node attaches to its rail’s eastern-most action (`x+w` maxima).
     *  - Vanilla: single main end anchored to farthest legacy action on the spine.
     *  - Fork compare:
     *      ghost/main end ← rightmost legacy action (including nested task tails);
     *      fork end ← rightmost forked action (nested tasks included).
     *    Decide membership with `forkCompareRow === 2`, not solely `actionSessionKey`, so forked-task tails stay connected.
     *  - Skip terminator pairs fan-in already handled (prevents doubling edges).
     */
    for (let endIdx = 0; endIdx < layout.length; endIdx++) {
      const endItem = layout[endIdx]!
      if (endItem.node.kind !== 'end') continue
      const endIsForkBranch = endItem.node.sessionRegion === 'fork-new-branch'
      let lastIdx = -1
      let lastRight = -Infinity
      for (let j = 0; j < layout.length; j++) {
        const it = layout[j]!
        if (it.node.kind !== 'action') continue
        const a = it.node as MappedAction & { row: number }
        const aIsNewBranch = isNewBranchAction(a)
        if (aIsNewBranch !== endIsForkBranch) continue
        const right = it.x + it.w
        if (right > lastRight) {
          lastRight = right
          lastIdx = j
        }
      }
      if (lastIdx < 0) continue
      if (parallelJoinSkip.has(`${lastIdx}-${endIdx}`)) continue
      const lastItem = layout[lastIdx]!
      const lastAct = lastItem.node as MappedAction & { row: number }
      const isGhostEnd = !endIsForkBranch && hasForkNewBranchInLayout
      const stroke = isGhostEnd || lastAct.forkGhost ? FORK_GHOST_STROKE : actionFlowPalette.arrow
      const marker = isGhostEnd || lastAct.forkGhost ? ghostMarkerUrl : markerUrl
      appendOrthoEdge(
        content,
        lastItem.x + lastItem.w,
        lastItem.cy,
        endItem.x,
        endItem.cy,
        marker,
        stroke,
        1.2,
        actionKey(lastAct),
        null,
      )
    }

    /**
     * Fork fan-out wiring: anchor fans into both rails’ first parent-scope actions —
     * - earliest ghost predecessor (post-fork leftover trail)
     * - earliest fork-branch parent action (`forkCompareRow === 2`)
     *
     * Ignore child-session internals so forks land on rails, not nested bands.
     */
    if (hasForkNewBranchInLayout && forkAnchorActionKey) {
      let anchorItem: (typeof layout)[number] | undefined
      for (const item of layout) {
        if (item.node.kind !== 'action') continue
        if (actionKey(item.node as MappedAction & { row: number }) === forkAnchorActionKey) {
          anchorItem = item
          break
        }
      }
      let firstGhostItem: (typeof layout)[number] | undefined
      let firstGhostSortTime = Infinity
      for (const item of layout) {
        if (item.node.kind !== 'action') continue
        const a = item.node as MappedAction & { row: number }
        if (a.forkGhost !== true) continue
        if (a.source === 'child-session') continue
        if (a.sortTime < firstGhostSortTime) {
          firstGhostSortTime = a.sortTime
          firstGhostItem = item
        }
      }
      let firstNewBranchItem: (typeof layout)[number] | undefined
      let firstNewBranchSortTime = Infinity
      for (const item of layout) {
        if (item.node.kind !== 'action') continue
        const a = item.node as MappedAction & { row: number }
        if (!isNewBranchAction(a)) continue
        if (a.source === 'child-session') continue
        if (a.sortTime < firstNewBranchSortTime) {
          firstNewBranchSortTime = a.sortTime
          firstNewBranchItem = item
        }
      }
      if (anchorItem) {
        const targets = [firstGhostItem, firstNewBranchItem].filter((it): it is FlowLayoutItem =>
          Boolean(it),
        )
        if (targets.length > 0) {
          appendOrthoFanOut(content, anchorItem, targets, markerUrl, ghostMarkerUrl)
        }
      }
    }

    /**
     * Safety net before the fork anchor: reconnect historical spine steps `1→2→…→anchor` when sequential layout misses hops.
     */
    if (hasForkNewBranchInLayout && forkAnchorActionKey) {
      let anchorSortTime = Infinity
      for (const item of layout) {
        if (item.node.kind !== 'action') continue
        const a = item.node as MappedAction & { row: number }
        if (actionKey(a) === forkAnchorActionKey) {
          anchorSortTime = a.sortTime
          break
        }
      }
      if (Number.isFinite(anchorSortTime)) {
        const prefixItems = layout
          .filter((item) => {
            if (item.node.kind !== 'action') return false
            const a = item.node as MappedAction & { row: number }
            if (a.source === 'child-session') return false
            if (isNewBranchAction(a)) return false
            if (a.forkGhost === true) return false
            return a.sortTime <= anchorSortTime
          })
          .sort((p, q) => {
            const pa = p.node as MappedAction & { row: number }
            const qa = q.node as MappedAction & { row: number }
            return pa.sortTime - qa.sortTime
          })
        for (let i = 0; i < prefixItems.length - 1; i++) {
          const from = prefixItems[i]!
          const to = prefixItems[i + 1]!
          const pa = from.node as MappedAction & { row: number }
          const pb = to.node as MappedAction & { row: number }
          if (parallelSiblingSkip(pa, pb)) continue
          const fromK = actionKey(pa)
          const toK = actionKey(pb)
          if (edgeExists(fromK, toK)) continue
          const { stroke, markerUrl: m } = edgeStrokeAndMarker(pa, pb, markerUrl, ghostMarkerUrl)
          appendOrthoEdge(
            content,
            from.x + from.w,
            from.cy,
            to.x,
            to.cy,
            m,
            stroke,
            1.2,
            fromK,
            toK,
          )
        }
      }
    }

    /** Purple branch from parent Subagent(task) rects into nested child-session entry */
    for (let i = 0; i < layout.length - 1; i++) {
      const item = layout[i]!
      const node = item.node
      if (node.kind !== 'action') continue
      if (node.actionType !== 'Subagent' || !node.childSessionID || !node.callID) continue
      let firstChild: (typeof layout)[0] | undefined
      for (let j = i + 1; j < layout.length - 1; j++) {
        const it = layout[j]!
        if (it.node.kind !== 'action') continue
        const a = it.node as MappedAction & { row: number }
        if (
          a.source === 'child-session' &&
          a.parentTaskCallID === node.callID &&
          a.branchChildSessionID === node.childSessionID
        ) {
          firstChild = it
          break
        }
      }
      if (!firstChild) continue
      const x1 = item.x + item.w
      const y1 = item.cy
      const x2 = firstChild.x
      const y2 = firstChild.cy
      const mid = (x1 + x2) / 2
      const branchPath = d3.path()
      branchPath.moveTo(x1, y1)
      branchPath.lineTo(mid, y1)
      branchPath.lineTo(mid, y2)
      branchPath.lineTo(x2, y2)
      const parentAct = node as MappedAction & { row: number }
      const childAct = firstChild.node as MappedAction & { row: number }
      const { stroke: branchStroke, markerUrl: branchMarker } = edgeStrokeAndMarker(
        parentAct,
        childAct,
        markerUrl,
        ghostMarkerUrl,
      )
      content
        .append('path')
        .attr('class', 'afv-edge')
        .attr('d', branchPath.toString())
        .attr('fill', 'none')
        .attr('stroke', branchStroke)
        .attr('stroke-width', 1.2)
        .attr('marker-end', branchMarker)
        .attr('pointer-events', 'none')
    }

    if (canMockFork) {
      const forkItem = layout[mockBranchForkActionIndex as number]
      if (forkItem) {
        const historyTemplates = [
          { actionType: 'Think', status: 'completed', durationMs: 420, tokenEstimate: 24 },
          { actionType: 'Read', status: 'completed', durationMs: 560, tokenEstimate: 40 },
          { actionType: 'Response', status: 'completed', durationMs: 380, tokenEstimate: 28 },
        ] as const
        const historyY = rowTopY(0) - ROW_H + BLOCK_H / 2

        const historyWidths = historyTemplates.map((h) => blockWidth(durationMode, h.durationMs))
        const historyStartX = forkItem.x + forkItem.w + GAP

        let hx = historyStartX
        historyTemplates.forEach((h, i) => {
          const hw = historyWidths[i]!
          content
            .append('rect')
            .attr('x', hx)
            .attr('y', historyY - BLOCK_H / 2)
            .attr('width', hw)
            .attr('height', BLOCK_H)
            .attr('rx', 4)
            .attr('fill', 'var(--color-bg-soft)')
            .attr('stroke', 'var(--color-text-muted)')
            .attr('stroke-width', 1.5)
            .style('cursor', 'default')

          if (contentNode) {
            appendActionFlowIcon(
              contentNode,
              getActionFlowIconSvg(h.actionType),
              hx + hw / 2,
              historyY,
              'var(--color-text-muted)',
              `${reactId}-mock-history-${i}-`,
            )
          }

          if (i < historyTemplates.length - 1) {
            const link = d3.path()
            link.moveTo(hx + hw, historyY)
            link.lineTo(hx + hw + GAP, historyY)
            content
              .append('path')
              .attr('d', link.toString())
              .attr('fill', 'none')
              .attr('stroke', 'var(--color-control-muted)')
              .attr('stroke-width', 1.2)
              .attr('marker-end', markerUrl)
              .attr('pointer-events', 'none')
          }
          hx += hw + GAP
        })

        const firstHistoryX = historyStartX
        // Match primary edges: orthogonal H-V-H pivot at midpoint to avoid diagonal segments
        const x1 = forkItem.x + forkItem.w
        const y1 = forkItem.cy
        const x2 = firstHistoryX
        const y2 = historyY
        const mid = (x1 + x2) / 2
        const connect = d3.path()
        connect.moveTo(x1, y1)
        connect.lineTo(mid, y1)
        connect.lineTo(mid, y2)
        connect.lineTo(x2, y2)
        content
          .append('path')
          .attr('d', connect.toString())
          .attr('fill', 'none')
          .attr('stroke', 'var(--color-control-muted)')
          .attr('stroke-width', 1.2)
          .attr('marker-end', markerUrl)
          .attr('pointer-events', 'none')
      }
    }

    /** Rectangles paint after edges by default — re-raise paths so strokes stay readable */
    content.selectAll<SVGPathElement, unknown>('path.afv-edge').raise()

    const desiredH = totalH + topOffset
    // Pixel-sized SVG (no scaling viewBox) keeps block proportions stable regardless of lane count
    root.attr('width', totalW).attr('height', desiredH)
    svg.removeAttribute('viewBox')

    if (filterMode !== null && autoScrollFirstFilteredMatch) {
      const firstMatched = layout.find((item) => {
        if (item.node.kind !== 'action') return false
        const a = item.node as MappedAction & { row: number }
        if (filterMode === 'duration') {
          return Number.isFinite(a.durationMs) && a.durationMs >= (durationHighlightMinMs as number)
        }
        return Number.isFinite(a.tokenEstimate) && a.tokenEstimate >= (tokenHighlightMin as number)
      })
      if (firstMatched && scrollRef.current) {
        const targetLeft = Math.max(0, firstMatched.x - 18)
        scrollRef.current.scrollTo({ left: targetLeft, behavior: 'smooth' })
      }
    }
  }, [
    actions,
    durationMode,
    colorMode,
    actionTypePaletteId,
    prefersDark,
    durationHighlightMinMs,
    tokenHighlightMin,
    autoScrollFirstFilteredMatch,
    tooltipMessages,
    markerId,
    tooltipId,
    mockBranchForkActionIndex,
    onForkFromAction,
    onAnalyzeFromAction,
    onSelectAction,
    reactId,
    showFlowEndNode,
    flowEndSummary,
    embedded,
    viewportMaxHeight,
    forkAnchorActionKey,
  ])

  /**
   * Unified dimming pipeline merges cross-subtask `dimAll`, type-level highlighting, thresholds, and edges.
   * - `dimAll`: fade entire visualization while another card holds focus.
   * - **`highlightedActionKey`**: keep peers at full-opacity (no perimeter stroke — selection is conveyed by connectors only).
   * - **`highlightedActionType`** (no key): fades groups outside the matching type bucket.
   * - Threshold mode tags `data-filter-dim` on groups / edges independently.
   */
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const groups = Array.from(svg.querySelectorAll<SVGGElement>('g.afv-action[data-action-key]'))
    const edges = Array.from(svg.querySelectorAll<SVGPathElement>('path.afv-edge'))
    const DIM = '0.18'
    const durationFilterActive =
      durationHighlightMinMs != null && Number.isFinite(durationHighlightMinMs)
    const tokenFilterActive = tokenHighlightMin != null && Number.isFinite(tokenHighlightMin)
    const thresholdFilterActive = durationFilterActive || tokenFilterActive

    if (dimAll) {
      svg.style.opacity = '0.35'
    } else {
      svg.style.opacity = ''
    }

    /** Highlight bucket: singleton key vs every key sharing the hovered type */
    let highlightSet: Set<string> | null = null
    if (highlightedActionKey) {
      highlightSet = new Set([highlightedActionKey])
    } else if (highlightedActionType) {
      highlightSet = new Set()
      for (const g of groups) {
        if (g.getAttribute('data-action-type') === highlightedActionType) {
          const k = g.getAttribute('data-action-key')
          if (k) highlightSet.add(k)
        }
      }
    }

    if (highlightSet === null && !thresholdFilterActive) {
      for (const g of groups) g.style.opacity = '1'
      for (const e of edges) e.style.opacity = '1'
      return
    }

    /** Single-action click: emphasize with a stroke ring only — do not fade other glyphs. */
    const outlineOnlySingleAction = Boolean(highlightedActionKey)

    for (const g of groups) {
      const k = g.getAttribute('data-action-key') ?? ''
      const filterDimActive =
        highlightSet === null && thresholdFilterActive && g.getAttribute('data-filter-dim') === '1'
      const selDim = outlineOnlySingleAction ? false : highlightSet !== null && !highlightSet.has(k)
      g.style.opacity = selDim || filterDimActive ? DIM : '1'
    }

    for (const e of edges) {
      const fk = e.getAttribute('data-from-key')
      const tk = e.getAttribute('data-to-key')
      let dim = false
      if (highlightSet !== null && !outlineOnlySingleAction) {
        const fromHit = fk !== null && highlightSet.has(fk)
        const toHit = tk !== null && highlightSet.has(tk)
        dim = !fromHit && !toHit
      }
      /** Edges inherit threshold dimming when both endpoints fail the filter */
      if (!dim && highlightSet === null && thresholdFilterActive && (fk || tk)) {
        const esc = (s: string) =>
          typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"')
        const fromGroup = fk
          ? svg.querySelector<SVGGElement>(`g.afv-action[data-action-key="${esc(fk)}"]`)
          : null
        const toGroup = tk
          ? svg.querySelector<SVGGElement>(`g.afv-action[data-action-key="${esc(tk)}"]`)
          : null
        const fromFiltered = fromGroup?.getAttribute('data-filter-dim') === '1'
        const toFiltered = toGroup?.getAttribute('data-filter-dim') === '1'
        if (fromFiltered && toFiltered) dim = true
      }
      e.style.opacity = dim ? DIM : '1'
    }
  }, [
    highlightedActionType,
    highlightedActionKey,
    dimAll,
    actions,
    durationHighlightMinMs,
    tokenHighlightMin,
  ])
  return {
    svgRef,
    scrollRef,
    contextMenu,
    setContextMenu,
    tooltipMounted,
    tooltipId,
    layoutEstimate,
  }
}
