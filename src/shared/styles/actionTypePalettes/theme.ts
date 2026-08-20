import * as d3 from 'd3'
import type { ActionTypeTriad } from './types'

/** `prefers-color-scheme: dark` check — safe when `window` is unavailable (SSR/tests) */
export function isDarkColorScheme(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches === true
}

/**
 * Dark-theme variant of a light triad: fills drop to a muted dark tone while strokes/accent
 * lighten so blocks and icons stay legible on near-black surfaces instead of glaring pastels.
 */
function adaptTriadForDark(triad: ActionTypeTriad): ActionTypeTriad {
  const tone = (hex: string, lightness: number, satMul = 1): string => {
    const c = d3.color(hex)
    if (!c) return hex
    const hsl = d3.hsl(c)
    const h = Number.isFinite(hsl.h) ? hsl.h : 220
    const s = Math.min(hsl.s * satMul, 0.55)
    return d3.hsl(h, s, lightness).formatHex()
  }
  return {
    fill: tone(triad.fill, 0.3, 0.85),
    stroke: tone(triad.stroke, 0.72, 1.1),
    accent: tone(triad.accent, 0.82, 1.1),
  }
}

export function adaptActionTypeTriadForDark(triad: ActionTypeTriad): ActionTypeTriad {
  return adaptTriadForDark(triad)
}