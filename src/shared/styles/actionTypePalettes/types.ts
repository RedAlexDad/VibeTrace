import type { ActionType } from '@/shared/types/opencode'

/** Matches `ActionType` union order — keeps D3 scheme lookups index-aligned */
export const ACTION_TYPE_ORDER: readonly ActionType[] = [
  'UserRequest',
  'Think',
  'Clarify',
  'Plan',
  'Permission',
  'Subagent',
  'Response',
  'Read',
  'Write',
  'Shell',
  'Search',
  'Skill',
  'Compaction',
] as const

export type ActionTypePaletteId =
  | 'pastelPaired7'
  | 'contrast'
  | 'spectrum'
  | 'd3PairedVivid7'
  | 'd3Paired'
  | 'd3PairedVivid'
  | 'd3Observable'
  | 'd3ObservableVivid'
  | 'customUserA'

export const ACTION_TYPE_PALETTE_LABELS: Record<ActionTypePaletteId, string> = {
  pastelPaired7: 'Pastel 7 — paired fill + icon',
  contrast: 'High contrast — hand-tuned',
  spectrum: 'Hue spread — hand-tuned (soft yellow / magenta)',
  d3PairedVivid7: 'd3 schemePaired — vivid 7-group',
  d3Paired: 'd3 schemePaired — soft',
  d3PairedVivid: 'd3 schemePaired — vivid',
  d3Observable: 'd3 Observable10 + Tableau — soft',
  d3ObservableVivid: 'd3 Observable10 + Tableau — vivid',
  customUserA: 'Custom palette A (10 base + 2 fill-ins)',
}

export type ActionTypeTriad = { fill: string; stroke: string; accent: string }

export const DEFAULT_ACTION_TYPE_PALETTE_ID: ActionTypePaletteId = 'pastelPaired7'