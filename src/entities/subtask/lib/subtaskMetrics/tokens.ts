import type { OcMessage } from '@/shared/types/opencode'
import { TOKEN_COST_RATES_USD_PER_1K, type SubtaskTokenBreakdown } from './types'

/** Matches OpenCode context-panel semantics: per-message token total = input + output + reasoning + cache (see opencode-context-panel.md). */
export function tokenTotalForMessage(tokens: OcMessage['info']['tokens'] | undefined): number {
  if (!tokens) return 0
  if (typeof tokens.total === 'number' && tokens.total > 0) {
    return tokens.total
  }
  const c = tokens.cache
  return (
    (tokens.input ?? 0) +
    (tokens.output ?? 0) +
    (tokens.reasoning ?? 0) +
    (c?.read ?? 0) +
    (c?.write ?? 0)
  )
}

export function estimateCostUsdFromTokenBreakdown(bd: SubtaskTokenBreakdown): number {
  const r = TOKEN_COST_RATES_USD_PER_1K
  return (
    (bd.input / 1000) * r.input +
    (bd.output / 1000) * r.output +
    (bd.reasoning / 1000) * r.reasoning +
    (bd.cacheRead / 1000) * r.cacheRead +
    (bd.cacheWrite / 1000) * r.cacheWrite
  )
}

/** Card display: prefer API `cost`; else estimate from breakdown (rates in `TOKEN_COST_RATES_USD_PER_1K`). */
export function formatSubtaskCostDisplay(m: {
  costSegmentSum: number
  costEstimatedUsd: number
}): string {
  if (m.costSegmentSum > 0) {
    return `$${m.costSegmentSum.toFixed(4)}`
  }
  return `$${m.costEstimatedUsd.toFixed(2)}`
}
