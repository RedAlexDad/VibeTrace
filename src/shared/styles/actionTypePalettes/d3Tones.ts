import * as d3 from 'd3'
import type { ActionTypeTriad } from './types'

/**
 * Map a d3 scheme swatch into UI `{fill,stroke,accent}`: bright low-sat fill, deeper strokes.
 * Extra desaturation on red/yellow hues so we do not collide with error (red) or pending (amber).
 */
export function triadFromD3SchemeColor(hex: string): ActionTypeTriad {
  const base = d3.color(hex)
  if (!base) return { fill: '#F0F0F0', stroke: '#888888', accent: '#333333' }
  const hsl = d3.hsl(base)
  const h = Number.isFinite(hsl.h) ? hsl.h : 220

  let fillS = Math.min(hsl.s * 0.32 + 0.06, 0.38)
  let fillL = 0.91
  let strokeS = Math.min(hsl.s * 0.48 + 0.08, 0.52)
  const strokeL = 0.52
  let accentS = Math.min(hsl.s * 0.55 + 0.1, 0.58)
  const accentL = 0.34

  // Red band: lighten + desaturate vs error reds
  if ((h >= 0 && h < 32) || h >= 348) {
    fillS *= 0.55
    strokeS *= 0.6
    accentS *= 0.65
    fillL = Math.max(fillL, 0.9)
  }
  // Yellow band: nudge hue toward amber, lower saturation vs pending yellows
  if (h >= 38 && h < 72) {
    hsl.h = h + 6
    fillS *= 0.5
    strokeS *= 0.55
    fillL = Math.max(fillL, 0.92)
  }

  const fill = d3.hsl(hsl.h, fillS, fillL).formatHex()
  const stroke = d3.hsl(hsl.h, strokeS, strokeL).formatHex()
  const accent = d3.hsl(hsl.h, accentS, accentL).formatHex()
  return { fill, stroke, accent }
}

/** Brighter d3-derived variant — preserves chroma instead of muddy darkening */
export function triadFromD3SchemeColorVivid(hex: string): ActionTypeTriad {
  const base = d3.color(hex)
  if (!base) return { fill: '#F0F0F0', stroke: '#888888', accent: '#333333' }
  const hsl = d3.hsl(base)
  const h = Number.isFinite(hsl.h) ? hsl.h : 220

  let fillS = Math.min(hsl.s * 0.62 + 0.1, 0.72)
  let fillL = 0.86
  let strokeS = Math.min(hsl.s * 0.76 + 0.12, 0.85)
  const strokeL = 0.58
  let accentS = Math.min(hsl.s * 0.84 + 0.12, 0.9)
  const accentL = 0.42

  if ((h >= 0 && h < 32) || h >= 348) {
    fillS *= 0.72
    strokeS *= 0.78
    accentS *= 0.82
    fillL = Math.max(fillL, 0.88)
  }
  if (h >= 38 && h < 72) {
    hsl.h = h + 4
    fillS *= 0.68
    strokeS *= 0.72
    fillL = Math.max(fillL, 0.9)
  }

  return {
    fill: d3.hsl(hsl.h, fillS, fillL).formatHex(),
    stroke: d3.hsl(hsl.h, strokeS, strokeL).formatHex(),
    accent: d3.hsl(hsl.h, accentS, accentL).formatHex(),
  }
}