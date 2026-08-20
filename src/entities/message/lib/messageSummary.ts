import type { OcMessage } from '@/shared/types/opencode'

export interface MessageSummary {
  mode: string | null
  agent: string | null
  model: string | null
  /** Duration of the assistant reply (completed - created), ms */
  llmMs: number | null
  /** Time until the first output part (first reasoning/text/tool timestamp - created), ms */
  ttftMs: number | null
  /** Output tokens per second across the reply */
  tokPerSec: number | null
  /** Cache read % of input tokens */
  cacheHitPct: number | null
  tokens: {
    input: number
    output: number
    reasoning: number
    total: number
  }
  cost: number | null
  toolCalls: number
  toolMs: number | null
}

export function formatMs(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}m${String(sec).padStart(2, '0')}s`
}

/**
 * Summary of the last assistant reply that follows the last user message.
 * Used under the newest user bubble (deepseek-harness style stats line).
 */
export function buildMessageSummary(messages: OcMessage[]): MessageSummary | null {
  if (messages.length < 2) return null

  // Find the last user message index
  let lastUserIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.info.role === 'user') {
      lastUserIdx = i
      break
    }
  }
  if (lastUserIdx < 0) return null

  // The assistant reply that follows it
  let reply: OcMessage | null = null
  for (let i = lastUserIdx + 1; i < messages.length; i++) {
    if (messages[i]!.info.role === 'assistant') {
      reply = messages[i]!
      break
    }
  }
  if (!reply) return null

  const info = reply.info
  const created = info.time?.created
  const completed = info.time?.completed

  let llmMs: number | null = null
  if (created && completed && completed >= created) llmMs = completed - created

  // TTFT: first output part timestamp (reasoning has time, tools have state.time.start)
  let firstOutputTs: number | null = null
  for (const p of reply.parts) {
    if (p.type === 'reasoning' && p.time?.start) {
      firstOutputTs = p.time.start
      break
    }
    if (p.type === 'tool' && p.state?.time?.start) {
      firstOutputTs = p.state.time.start
      break
    }
  }
  const ttftMs =
    created && firstOutputTs && firstOutputTs >= created ? firstOutputTs - created : null

  let toolCalls = 0
  let toolMs: number | null = null
  let toolSum = 0
  let toolAny = false
  for (const p of reply.parts) {
    if (p.type !== 'tool') continue
    toolCalls++
    const st = p.state?.time
    if (st?.start && st.end && st.end >= st.start) {
      toolAny = true
      toolSum += st.end - st.start
    }
  }
  if (toolAny) toolMs = toolSum

  const tok = info.tokens
  const input = tok?.input ?? 0
  const output = tok?.output ?? 0
  const reasoning = tok?.reasoning ?? 0
  const cacheRead = tok?.cache?.read ?? 0
  const total = tok?.total ?? input + output + reasoning

  const cacheHitPct =
    cacheRead + input > 0 ? Math.round((cacheRead / (cacheRead + input)) * 100) : null

  const tokPerSec = llmMs && llmMs > 0 && output > 0 ? (output / llmMs) * 1000 : null

  return {
    mode: info.mode ?? null,
    agent: info.agent ?? null,
    model: info.model?.modelID ?? null,
    llmMs,
    ttftMs,
    tokPerSec,
    cacheHitPct,
    tokens: { input, output, reasoning, total },
    cost: info.cost ?? null,
    toolCalls,
    toolMs,
  }
}
