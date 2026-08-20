import {
  DUR_GAP_MIN_PX,
  DUR_GAP_PX_PER_MS,
  DUR_PX_PER_MS,
  DUR_WIDTH_BASE_MS,
  MIN_W,
} from './constants'

/**
 * Same slope as blocks past `[10ms,120s] → [28px,200px]`, extrapolating linearly without caps.
 * `w = 28 + DUR_PX_PER_MS * (duration - 10)` whenever duration > 10.
 */
export function durationBlockExtraPx(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= DUR_WIDTH_BASE_MS) return 0
  return DUR_PX_PER_MS * (durationMs - DUR_WIDTH_BASE_MS)
}

/**
 * Inter-slot idle `gapMs = next.minStart - prev.maxEnd` (clamped ≥0) maps to layout `interSlotGap` px,
 * roughly matching the horizontal span of orthogonal edge segments.
 * Unlike blocks (`MIN_W = 28`), gaps start from `DUR_GAP_MIN_PX = 10` and hit 200px wide at ~2 min.
 */
export function durationGapWidthPx(gapMs: number): number {
  if (!Number.isFinite(gapMs) || gapMs <= 0) return DUR_GAP_MIN_PX
  if (gapMs <= DUR_WIDTH_BASE_MS) return DUR_GAP_MIN_PX
  return DUR_GAP_MIN_PX + DUR_GAP_PX_PER_MS * (gapMs - DUR_WIDTH_BASE_MS)
}

export function durationStartOffsetPx(slotStart: number, actionStart: number): number {
  if (!Number.isFinite(slotStart) || !Number.isFinite(actionStart)) return 0
  const deltaMs = Math.max(0, actionStart - slotStart)
  return durationBlockExtraPx(deltaMs)
}

export function blockWidth(durationMode: boolean, durationMs: number): number {
  return durationWidthMeta(durationMode, durationMs).w
}

export function durationWidthMeta(
  durationMode: boolean,
  durationMs: number,
): { w: number; overThreshold: boolean } {
  if (!durationMode) return { w: MIN_W, overThreshold: false }
  if (!Number.isFinite(durationMs) || durationMs <= 0) return { w: MIN_W, overThreshold: false }
  if (durationMs <= DUR_WIDTH_BASE_MS) return { w: MIN_W, overThreshold: false }
  const w = MIN_W + durationBlockExtraPx(durationMs)
  return { w, overThreshold: false }
}

export function formatDurationMs(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return '—'
  const sec = durationMs / 1000
  if (sec < 0.01) return '<0.01s'
  return `${sec.toFixed(2)}s`
}
