import type { SessionSummary } from '@/entities/message/lib/messageSummary'
import { formatMs } from '@/entities/message/lib/messageSummary'

function formatCost(cost: number | null): string | null {
  if (cost === null || cost <= 0) return null
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(3)}`
}

function formatCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function MessageSummaryLine({ summary }: { summary: SessionSummary }) {
  const parts: string[] = []

  parts.push(`${summary.turns} turns · ${summary.steps} steps`)
  const llm = formatMs(summary.llmMs)
  if (llm) parts.push(`LLM ${llm}`)
  if (summary.toolMs > 0) {
    parts.push(`Tool call ${formatMs(summary.toolMs)}`)
  }
  if (summary.ttftAvgMs !== null) parts.push(`TTFT avg ${formatMs(summary.ttftAvgMs)}`)
  if (summary.tokPerSec !== null) parts.push(`${Math.round(summary.tokPerSec)} tok/s`)
  if (summary.cacheHitPct !== null) parts.push(`Cache hit ${summary.cacheHitPct}%`)
  if (summary.tokens.input > 0 || summary.tokens.output > 0) {
    parts.push(
      `In ${formatCount(summary.tokens.input)} · Out ${formatCount(summary.tokens.output)}`,
    )
  }
  if (summary.tokens.reasoning > 0) parts.push(`Reason ${formatCount(summary.tokens.reasoning)}`)
  const cost = formatCost(summary.cost)
  if (cost) parts.push(cost)

  if (parts.length === 0) return null

  return (
    <div
      style={{
        marginTop: 6,
        fontSize: 11,
        lineHeight: 1.5,
        color: 'var(--color-text-secondary)',
        textAlign: 'center',
        fontFamily: 'IBM Plex Mono, monospace',
        wordBreak: 'break-word',
        display: 'inline-block',
        maxWidth: '100%',
        padding: '3px 10px',
        borderRadius: 6,
        background: 'var(--color-bg-subtle)',
        border: '1px solid var(--color-border-faint)',
      }}
    >
      {parts.join(' · ')}
    </div>
  )
}
