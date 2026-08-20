import type { OcMessage } from '@/shared/types/opencode'

export interface SessionSummary {
  /** Number of user messages (turns) */
  turns: number
  /** Number of tool calls across the session */
  steps: number
  /** Total LLM time across assistant replies, ms */
  llmMs: number
  /** Total tool call time, ms */
  toolMs: number
  /** Average TTFT (first output part) across replies, ms */
  ttftAvgMs: number | null
  /** Output tokens per second across the session */
  tokPerSec: number | null
  /** Cache read % of total input */
  cacheHitPct: number | null
  tokens: {
    input: number
    output: number
    reasoning: number
    total: number
  }
  cost: number | null
  /** Mode counts (e.g. build/plan/compaction) */
  modes: Record<string, number>
}

export function formatMs(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  if (m < 60) return `${m}m${String(sec).padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h}h${String(mm).padStart(2, '0')}m`
}

/**
 * Aggregate statistics across the whole session, deepseek-harness style:
 * turns · steps | LLM time · tool call time | TTFT avg · tok/s | cache hit | in/out tokens.
 */
export function buildSessionSummary(messages: OcMessage[]): SessionSummary {
  let turns = 0
  let steps = 0
  let llmMs = 0
  let toolMs = 0
  let input = 0
  let output = 0
  let reasoning = 0
  let cacheRead = 0
  let cost = 0
  let ttftSum = 0
  let ttftCount = 0
  const modes: Record<string, number> = {}

  for (const m of messages) {
    const info = m.info
    if (info.role === 'user') {
      turns++
      continue
    }
    if (info.role !== 'assistant') continue

    const created = info.time?.created
    const completed = info.time?.completed
    if (created && completed && completed >= created) {
      llmMs += completed - created
    }

    const tok = info.tokens
    if (tok) {
      input += tok.input ?? 0
      output += tok.output ?? 0
      reasoning += tok.reasoning ?? 0
      cacheRead += tok.cache?.read ?? 0
    }
    if (info.cost) cost += info.cost

    const mode = info.mode || info.agent
    if (mode) modes[mode] = (modes[mode] ?? 0) + 1

    // TTFT: first output part timestamp - created
    let firstOutputTs: number | null = null
    for (const p of m.parts) {
      if (p.type === 'reasoning' && p.time?.start) {
        firstOutputTs = p.time.start
        break
      }
      if (p.type === 'tool' && p.state?.time?.start) {
        firstOutputTs = p.state.time.start
        break
      }
    }
    if (created && firstOutputTs && firstOutputTs >= created) {
      ttftSum += firstOutputTs - created
      ttftCount++
    }

    for (const p of m.parts) {
      if (p.type !== 'tool') continue
      steps++
      const st = p.state?.time
      if (st?.start && st.end && st.end >= st.start) {
        toolMs += st.end - st.start
      }
    }
  }

  const total = input + output + reasoning
  const ttftAvgMs = ttftCount > 0 ? ttftSum / ttftCount : null
  const tokPerSec = llmMs > 0 && output > 0 ? (output / llmMs) * 1000 : null
  const cacheHitPct =
    cacheRead + input > 0 ? Math.round((cacheRead / (cacheRead + input)) * 100) : null

  return {
    turns,
    steps,
    llmMs,
    toolMs,
    ttftAvgMs,
    tokPerSec,
    cacheHitPct,
    tokens: { input, output, reasoning, total },
    cost: cost > 0 ? cost : null,
    modes,
  }
}
