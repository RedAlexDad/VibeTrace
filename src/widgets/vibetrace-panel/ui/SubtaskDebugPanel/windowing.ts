/** Estimated height for a not-yet-mounted card while windowing (placeholder sizing). */
export const CARD_ESTIMATED_HEIGHT = 320
/** Extra cards rendered above/below the visible window to avoid blank gaps while scrolling. */
export const CARD_OVERSCAN = 2

export interface CardWindow {
  start: number
  end: number
  topSpacer: number
  bottomSpacer: number
}

/** Compute which cards to mount + spacer heights given scrollTop and measured card heights. */
export function computeCardWindow(
  scrollTop: number,
  viewportH: number,
  count: number,
  heights: number[],
  forceIndex?: number | null,
): CardWindow {
  if (count === 0) return { start: 0, end: -1, topSpacer: 0, bottomSpacer: 0 }
  // running prefix sums
  let acc = 0
  const topByIndex = heights.map((h) => {
    const at = acc
    acc += h
    return at
  })
  const totalH = acc

  const viewTop = Math.max(0, scrollTop - CARD_OVERSCAN * CARD_ESTIMATED_HEIGHT)
  const viewBottom = scrollTop + viewportH + CARD_OVERSCAN * CARD_ESTIMATED_HEIGHT

  let start = 0
  let end = count - 1
  for (let i = 0; i < count; i++) {
    if (topByIndex[i] + heights[i] > viewTop) {
      start = i
      break
    }
  }
  for (let i = start; i < count; i++) {
    if (topByIndex[i] <= viewBottom) end = i
    else break
  }

  // Ensure the linked card is mounted so connector scrollIntoView can find it.
  if (forceIndex != null && forceIndex >= 0 && forceIndex < count) {
    start = Math.min(start, forceIndex)
    end = Math.max(end, forceIndex)
  }

  const topSpacer = topByIndex[start] ?? 0
  const bottomSpacer = Math.max(0, totalH - (topByIndex[end] ?? 0) - heights[end])
  return { start, end, topSpacer, bottomSpacer }
}