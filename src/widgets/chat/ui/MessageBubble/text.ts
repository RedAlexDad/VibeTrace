import type { OcMessage, OcMessagePart } from '@/shared/types/opencode'
import { stripHarnessGuidanceForDisplay } from '@/shared/config/harnessGuidance'

/** User bubbles: payload usually lives under text parts while `info.content` may stay empty */
export function userMessageDisplayText(message: OcMessage): string {
  const c = message.info.content?.trim()
  if (c) return message.info.content!
  const fromParts = message.parts
    .filter((p): p is Extract<OcMessagePart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text || '')
    .join('')
    .trim()
  return fromParts
}

/** Chat column strips harness preamble regardless of toggle state */
export function userMessageBodyForDisplay(message: OcMessage): string {
  return stripHarnessGuidanceForDisplay(userMessageDisplayText(message))
}