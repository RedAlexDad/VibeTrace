import type { OcMessage, OcMessagePart } from '@/shared/types/opencode'
import { buildTooltipBody } from './body'
import { getPrimaryLabel, getStatusLabel } from './status'
import type { EnglishTooltipContent, TooltipKeyValue } from './types'

export function buildEnglishTooltipContent(
  part: OcMessagePart,
  ctx: { allMessages?: OcMessage[] } = {},
): EnglishTooltipContent {
  const primaryLabel = getPrimaryLabel(part)
  const statusLabel = getStatusLabel(part)
  return {
    primaryLabel,
    statusLabel,
    body: buildTooltipBody(part, ctx),
  }
}

/**
 * @deprecated legacy Chinese KV builder
 */
export function buildTooltipKeyValuesFromPart(
  part: OcMessagePart,
  _ctx?: { cwd?: string },
): TooltipKeyValue[] {
  const c = buildEnglishTooltipContent(part, {})
  return c.body
    .filter((l): l is { kind: 'kv'; key: string; value: string } => l.kind === 'kv')
    .map((l) => ({ key: l.key, value: l.value }))
}
