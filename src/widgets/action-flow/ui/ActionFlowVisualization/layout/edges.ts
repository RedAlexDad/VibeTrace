import * as d3 from 'd3'
import type { MappedAction } from '@/shared/types/opencode'
import { actionFlowPalette } from '@/shared/styles/actionFlowPalette'
import { actionKey } from '@/entities/action/lib/actionKey'
import { FORK_GHOST_STROKE } from './constants'
import type { FlowLayoutItem, FlowNode } from './types'

export function edgeStrokeAndMarker(
  a: MappedAction & { row: number },
  b: MappedAction & { row: number },
  normalMarkerUrl: string,
  ghostMarkerUrl: string,
): { stroke: string; markerUrl: string } {
  if (a.forkGhost || b.forkGhost) {
    return { stroke: FORK_GHOST_STROKE, markerUrl: ghostMarkerUrl }
  }
  return { stroke: actionFlowPalette.arrow, markerUrl: normalMarkerUrl }
}

export function parallelSiblingSkip(pa: MappedAction, pb: MappedAction): boolean {
  if (!pa.parallelGroupId || !pb.parallelGroupId) return false
  if (pa.parallelGroupId !== pb.parallelGroupId) return false
  if (pa.parallelLaneIndex === undefined || pb.parallelLaneIndex === undefined) return false
  return pa.parallelLaneIndex !== pb.parallelLaneIndex
}

/**
 * Single predecessor fans out to parallel successors via one shared bundle column so vertical segments overlap cleanly.
 * - Draw the trunk horizontally once (no arrow head).
 * - Emit one branch polyline per target ending with arrow heads.
 */

export function appendOrthoFanOut(
  content: d3.Selection<SVGGElement, unknown, null, undefined>,
  source: FlowLayoutItem,
  targets: FlowLayoutItem[],
  markerUrl: string,
  ghostMarkerUrl: string,
) {
  if (targets.length === 0) return
  const sna = source.node.kind === 'action' ? (source.node as MappedAction & { row: number }) : null
  const baseStroke = sna?.forkGhost ? FORK_GHOST_STROKE : actionFlowPalette.arrow
  const baseMarker = sna?.forkGhost ? ghostMarkerUrl : markerUrl

  if (targets.length === 1) {
    const t = targets[0]!
    appendOrthoEdge(
      content,
      source.x + source.w,
      source.cy,
      t.x,
      t.cy,
      baseMarker,
      baseStroke,
      1.2,
      sna ? actionKey(sna) : null,
      t.node.kind === 'action' ? actionKey(t.node as MappedAction & { row: number }) : null,
    )
    return
  }

  const minTargetX = Math.min(...targets.map((t) => t.x))
  const bundleX = (source.x + source.w + minTargetX) / 2

  /** Trunk: source.right → bundleX (single segment, avoids stacked arrow markers on one x). */
  const trunk = d3.path()
  trunk.moveTo(source.x + source.w, source.cy)
  trunk.lineTo(bundleX, source.cy)
  const tp = content
    .append('path')
    .attr('class', 'afv-edge')
    .attr('d', trunk.toString())
    .attr('fill', 'none')
    .attr('stroke', baseStroke)
    .attr('stroke-width', 1.2)
    .attr('pointer-events', 'none')
  if (sna) tp.attr('data-from-key', actionKey(sna))

  /** Branches: (bundleX, source.cy) → (bundleX, target.cy) → (target.x, target.cy) with arrow markers */
  for (const t of targets) {
    const tna = t.node.kind === 'action' ? (t.node as MappedAction & { row: number }) : null
    const stroke = tna?.forkGhost ? FORK_GHOST_STROKE : baseStroke
    const m = tna?.forkGhost ? ghostMarkerUrl : baseMarker
    const branch = d3.path()
    branch.moveTo(bundleX, source.cy)
    branch.lineTo(bundleX, t.cy)
    branch.lineTo(t.x, t.cy)
    const bp = content
      .append('path')
      .attr('class', 'afv-edge')
      .attr('d', branch.toString())
      .attr('fill', 'none')
      .attr('stroke', stroke)
      .attr('stroke-width', 1.2)
      .attr('marker-end', m)
      .attr('pointer-events', 'none')
    if (sna) bp.attr('data-from-key', actionKey(sna))
    if (tna) bp.attr('data-to-key', actionKey(tna))
  }
}

export function appendOrthoEdge(
  content: d3.Selection<SVGGElement, unknown, null, undefined>,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  markerUrl: string,
  stroke: string,
  strokeWidth: number,
  /** Link metadata: originating / terminating action keys (null for synthetic end nodes). */
  fromKey: string | null = null,
  toKey: string | null = null,
) {
  const mid = (x1 + x2) / 2
  const path = d3.path()
  path.moveTo(x1, y1)
  path.lineTo(mid, y1)
  path.lineTo(mid, y2)
  path.lineTo(x2, y2)
  const p = content
    .append('path')
    .attr('class', 'afv-edge')
    .attr('d', path.toString())
    .attr('fill', 'none')
    .attr('stroke', stroke)
    .attr('stroke-width', strokeWidth)
    .attr('marker-end', markerUrl)
    /** Disable pointer hits so rects/context menus remain reachable under edges */
    .attr('pointer-events', 'none')
  if (fromKey) p.attr('data-from-key', fromKey)
  if (toKey) p.attr('data-to-key', toKey)
}

export function joinStrokeForFanIn(
  from: MappedAction & { row: number },
  to: FlowNode,
  markerUrl: string,
  ghostMarkerUrl: string,
): { stroke: string; markerUrl: string } {
  if (to.kind === 'end') {
    return {
      stroke: from.forkGhost ? FORK_GHOST_STROKE : actionFlowPalette.arrow,
      markerUrl: from.forkGhost ? ghostMarkerUrl : markerUrl,
    }
  }
  return edgeStrokeAndMarker(from, to as MappedAction & { row: number }, markerUrl, ghostMarkerUrl)
}

/**
 * Many edges converge on one successor via a vertical spine at bundleX halfway between predecessors and target.
 */

export function appendOrthoFanIn(
  content: d3.Selection<SVGGElement, unknown, null, undefined>,
  sources: FlowLayoutItem[],
  target: FlowLayoutItem,
  markerUrl: string,
  ghostMarkerUrl: string,
) {
  if (sources.length === 0) return
  const targetKey =
    target.node.kind === 'action' ? actionKey(target.node as MappedAction & { row: number }) : null
  if (sources.length === 1) {
    const s = sources[0]!
    const na = s.node as MappedAction & { row: number }
    const { stroke, markerUrl: m } = joinStrokeForFanIn(na, target.node, markerUrl, ghostMarkerUrl)
    appendOrthoEdge(
      content,
      s.x + s.w,
      s.cy,
      target.x,
      target.cy,
      m,
      stroke,
      1.2,
      actionKey(na),
      targetKey,
    )
    return
  }
  /**
   * Fan-in merges parallel feeder edges into one shared trunk:
   * - Feeders omit arrow heads but keep per-edge stroke semantics.
   * - Exactly one downstream trunk segment renders the arrow to avoid stacking N markers.
   * - Trunk tint follows the dominant non-ghost feeder when possible so the terminator reads clean.
   */
  const maxEnd = Math.max(...sources.map((s) => s.x + s.w))
  const bundleX = (maxEnd + target.x) / 2

  for (const s of sources) {
    const na = s.node as MappedAction & { row: number }
    const { stroke } = joinStrokeForFanIn(na, target.node, markerUrl, ghostMarkerUrl)
    const path = d3.path()
    path.moveTo(s.x + s.w, s.cy)
    path.lineTo(bundleX, s.cy)
    path.lineTo(bundleX, target.cy)
    const p = content
      .append('path')
      .attr('class', 'afv-edge')
      .attr('d', path.toString())
      .attr('fill', 'none')
      .attr('stroke', stroke)
      .attr('stroke-width', 1.2)
      .attr('pointer-events', 'none')
      .attr('data-from-key', actionKey(na))
    if (targetKey) p.attr('data-to-key', targetKey)
  }

  const trunkSource =
    sources.find((s) => (s.node as MappedAction & { row: number }).forkGhost !== true) ??
    sources[0]!
  const trunkNa = trunkSource.node as MappedAction & { row: number }
  const { stroke: trunkStroke, markerUrl: trunkMarker } = joinStrokeForFanIn(
    trunkNa,
    target.node,
    markerUrl,
    ghostMarkerUrl,
  )
  const trunk = d3.path()
  trunk.moveTo(bundleX, target.cy)
  trunk.lineTo(target.x, target.cy)
  const tp = content
    .append('path')
    .attr('class', 'afv-edge')
    .attr('d', trunk.toString())
    .attr('fill', 'none')
    .attr('stroke', trunkStroke)
    .attr('stroke-width', 1.2)
    .attr('marker-end', trunkMarker)
    .attr('pointer-events', 'none')
  if (targetKey) tp.attr('data-to-key', targetKey)
}
