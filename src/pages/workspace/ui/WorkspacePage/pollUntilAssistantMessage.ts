import type { OcMessage } from '@/shared/types/opencode'
import { getMessages } from '@/shared/api/opencodeApi'
import { POLL_ASSISTANT_INTERVAL_MS, POLL_ASSISTANT_MAX_ROUNDS } from './constants'

export async function pollUntilAssistantMessage(
  sessionId: string,
  directory: string | undefined,
  isStillSelected: () => boolean,
  onMessages: (msgs: OcMessage[]) => void,
): Promise<void> {
  for (let i = 0; i < POLL_ASSISTANT_MAX_ROUNDS; i++) {
    await new Promise((r) => setTimeout(r, POLL_ASSISTANT_INTERVAL_MS))
    if (!isStillSelected()) return
    try {
      const msgs = await getMessages(sessionId, `poll assistant reply ${i + 1}`, directory)
      onMessages(msgs)
      const last = msgs[msgs.length - 1]
      if (last?.info.role === 'assistant') return
    } catch {
      /* polling continues */
    }
  }
}