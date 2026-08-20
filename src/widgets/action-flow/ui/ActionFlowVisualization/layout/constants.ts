export const MARGIN_LEFT = 24
export const GAP = 12
/**
 * Vertical layout (consistent with `actionMapping`):
 * - Each session uses two baseline layers: layer0 = kernel (Think / Response / Plan…), layer1 = tools, etc.;
 * - Parent-side task (Subagent): once `childSessionID` is known, its rect moves into **`session:task:`** child-session lanes (no longer drawn in the main session band);
 * - Parallel lanes on the same layer are staggered with `parallelLaneIndex`, so row count grows with parallelism;
 * - Child-session bands sit below `main`, with their own layers and lanes — height is not fixed.
 */
export const BLOCK_H = 28
export const ROW_H = 32
/** Vertical stagger for parallel lanes on the same logical row (same step as primary row spacing) */
export const PARALLEL_LANE_DY = ROW_H
export const SESSION_REGION_GAP = 10
export const TOP_PAD = 4
export const MIN_W = 28
/** Duration mode: durations ≤ this use the minimum block width (ms) */
export const DUR_WIDTH_BASE_MS = 10
/** Duration mode: reference wall-clock duration paired with `DUR_BLOCK_AT_REF_PX` */
export const DUR_REF_MS = 120_000
/** Duration mode: block outer edge at `DUR_REF_MS` (still `MIN_W` when `<= DUR_WIDTH_BASE_MS`) */
export const DUR_BLOCK_AT_REF_PX = 200
export const DUR_BETA_MS = Math.max(1, DUR_REF_MS - DUR_WIDTH_BASE_MS)
/**
 * Action block width: `w = MIN_W + DUR_PX_PER_MS * (durationMs - 10)` — below ~10 ms stays 28px, at 120s reaches 200px, then scales linearly.
 * Independent tuning from inter-slot gaps; see `DUR_GAP_MIN_PX` / `DUR_GAP_REF_PX`.
 */
export const DUR_PX_PER_MS = (DUR_BLOCK_AT_REF_PX - MIN_W) / DUR_BETA_MS
/**
 * Idle gap width between slots (px): floors at `DUR_GAP_MIN_PX`, reaches `DUR_GAP_REF_PX` at `DUR_GAP_REF_MS`
 * (“gap analogue” of the block width slope from the ~10 ms baseline):
 * `gapPx = DUR_GAP_MIN_PX + DUR_GAP_PX_PER_MS * max(0, gapMs - 10)`.
 * Tweak proportions via `DUR_GAP_*`; optionally align `DUR_WIDTH_BASE_MS` with combined block + gap timelines.
 */
export const DUR_GAP_MIN_PX = 10
export const DUR_GAP_REF_PX = 200
/** Paired with `DUR_GAP_*`; may differ from `DUR_REF_MS` (blocks) when you tune gap reference duration separately */
export const DUR_GAP_REF_MS = DUR_REF_MS
export const DUR_GAP_BETA_MS = Math.max(1, DUR_GAP_REF_MS - DUR_WIDTH_BASE_MS)
export const DUR_GAP_PX_PER_MS = (DUR_GAP_REF_PX - DUR_GAP_MIN_PX) / DUR_GAP_BETA_MS
export const DUR_TAIL_PAD_PX = 2
export const BOTTOM_PAD = 6
/** Minimum canvas height when at least two swimlanes and two blocks exist — avoids collapsing the SVG when data is sparse */
export const MIN_SVG_CONTENT_HEIGHT = TOP_PAD + 2 * ROW_H + 2 * BLOCK_H + BOTTOM_PAD
/** Clamp visible viewport to ~4 lanes including vertical padding */
export const MAX_VISIBLE_ROWS = 4
/** Matches context-menu typography for ellipsis / SVG text labels */
export const SVG_FONT_SANS =
  "'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
/** Fork snapshots: ghost segments no longer on the branch — rects + connectors */
export const FORK_GHOST_STROKE = 'var(--color-text-muted)'
export const FORK_GHOST_MARKER_FILL = 'var(--color-text-muted)'
