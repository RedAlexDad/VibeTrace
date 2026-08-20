import type { OcMessagePart, ToolPart } from '@/shared/types/opencode'

function getToolStatus(part: ToolPart): string {
  const s = part.state?.status
  if (s === 'error') return 'error'
  return s ?? 'unknown'
}

function getNonToolStatus(_part: OcMessagePart): string {
  return 'completed'
}

/** Bold label: tool name or `part.type` */
export function getPrimaryLabel(part: OcMessagePart): string {
  if (part.type === 'tool') return part.tool
  return part.type
}

export function getStatusLabel(part: OcMessagePart): string {
  if (part.type === 'tool') return getToolStatus(part)
  return getNonToolStatus(part)
}
