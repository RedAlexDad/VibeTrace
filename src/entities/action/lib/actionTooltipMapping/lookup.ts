import type { MappedAction, OcMessage, OcMessagePart } from '@/shared/types/opencode'

export function mergeMessagesForActionTooltipLookup(
  segmentMessages: OcMessage[],
  childBranchMessages: OcMessage[],
): OcMessage[] {
  return [...segmentMessages, ...childBranchMessages]
}

export function resolvePartForAction(
  allMessages: OcMessage[],
  act: Pick<MappedAction, 'partId' | 'messageIndex' | 'partIndex' | 'messageID'>,
): OcMessagePart | undefined {
  if (act.partId) {
    for (const msg of allMessages) {
      const p = msg.parts.find((pr) => pr.id === act.partId)
      if (p) return p
    }
  }
  /**
   * Child-session actions come from `buildMappedActionsFromMessages(childMessages)` where `messageIndex` is
   * local to that slice — it no longer matches `mergeMessagesForActionTooltipLookup` flattening. Fall back to
   * `messageID` + `partIndex` pairing on the merged assistant rows.
   */
  if (act.messageID && act.partIndex !== undefined) {
    for (const msg of allMessages) {
      if (msg.info.id === act.messageID) {
        return msg.parts[act.partIndex]
      }
    }
  }
  if (act.messageIndex !== undefined && act.partIndex !== undefined) {
    const msg = allMessages[act.messageIndex]
    if (!msg || msg.info.role !== 'assistant') return undefined
    return msg.parts[act.partIndex]
  }
  return undefined
}

/** @deprecated Prefer `resolvePartForAction` + `mergeMessagesForActionTooltipLookup` */
export function resolvePartForMappedAction(
  messages: OcMessage[],
  messageIndex: number | undefined,
  partIndex: number | undefined,
): OcMessagePart | undefined {
  return resolvePartForAction(messages, { partId: undefined, messageIndex, partIndex })
}