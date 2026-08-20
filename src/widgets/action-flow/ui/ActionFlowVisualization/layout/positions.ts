import { PARALLEL_LANE_DY, ROW_H, TOP_PAD } from './constants'
import type { FlowNode } from './types'

export function rowTopY(row: number): number {
  return TOP_PAD + row * ROW_H
}

export function laneOffsetY(parallelLaneIndex?: number): number {
  return (parallelLaneIndex ?? 0) * PARALLEL_LANE_DY
}

export function verticalCenterOffsetY(
  layout: { node: FlowNode; y: number; h: number }[],
  totalH: number,
): number {
  if (layout.length === 0) return 0
  let minY = Infinity
  let maxY = -Infinity
  for (const item of layout) {
    if (item.y < minY) minY = item.y
    if (item.y + item.h > maxY) maxY = item.y + item.h
  }
  const centerY = (minY + maxY) / 2
  return totalH / 2 - centerY
}
