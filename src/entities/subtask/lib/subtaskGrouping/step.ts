import type { OcMessage, OcMessagePart } from '@/shared/types/opencode'

function partIsStepFinishStop(part: OcMessagePart): boolean {
  const raw = part as { type?: string; reason?: string }
  if (raw.type !== 'step-finish') return false
  return raw.reason === 'stop'
}

/** True when this assistant row includes step-finish with reason === stop (Agent ended this step). */
export function messageHasAgentStepFinishStop(message: OcMessage): boolean {
  if (message.info.role !== 'assistant') return false
  return message.parts.some(partIsStepFinishStop)
}
