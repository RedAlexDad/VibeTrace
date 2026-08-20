import type { ActionType } from '@/shared/types/opencode'
import { ACTION_TYPE_PALETTES } from './palettes'
import { adaptActionTypeTriadForDark, isDarkColorScheme } from './theme'
import { ACTION_TYPE_ORDER } from './types'
import type { ActionTypePaletteId, ActionTypeTriad } from './types'

export function getActionTypeTriad(
  paletteId: ActionTypePaletteId,
  actionType: ActionType,
): ActionTypeTriad {
  const triad = ACTION_TYPE_PALETTES[paletteId][actionType]
  return isDarkColorScheme() ? adaptActionTypeTriadForDark(triad) : triad
}

export function getActionTypePaletteRecord(
  paletteId: ActionTypePaletteId,
): Record<ActionType, ActionTypeTriad> {
  const record = ACTION_TYPE_PALETTES[paletteId]
  if (!isDarkColorScheme()) return record
  const out = {} as Record<ActionType, ActionTypeTriad>
  for (const t of ACTION_TYPE_ORDER) out[t] = adaptActionTypeTriadForDark(record[t])
  return out
}