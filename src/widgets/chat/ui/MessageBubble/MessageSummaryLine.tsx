import type { MessageSummary } from '@/entities/message/lib/messageSummary'
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

export default function MessageSummaryLine({ summary }: { summary: MessageSummary }) {
  const modeLabel = summary.mode || summary.agent
  const parts: string[] = []

  const llm = formatMs(summary.llmMs)
  if (llm) parts.push(`LLM ${llm}`)
  if (summary.toolCalls > 0) {
    const toolTime = formatMs(summary.toolMs)
    parts.push(`Tool call ${summary.toolCalls}${toolTime ? ` · ${toolTime}` : ''}`)
  }
  if (summary.ttftMs !== null) parts.push(`TTFT ${formatMs(summary.ttftMs)}`)
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

  if (!modeLabel && parts.length === 0) return null

  const isPlan = modeLabel === 'plan'

  return (
    <div
      style={{
        marginTop: 6,
        fontSize: 11,
        lineHeight: 1.5,
        color: 'var(--color-text-secondary)',
        textAlign: 'right',
        fontFamily: 'IBM Plex Mono, monospace',
        wordBreak: 'break-word',
        display: 'inline-block',
        maxWidth: '100%',
        padding: '3px 8px',
        borderRadius: 6,
        background: 'var(--color-bg-subtle)',
        border: '1px solid var(--color-border-faint)',
      }}
    >
      <span
        style={{
          fontWeight: 600,
          color: isPlan ? 'var(--color-warning)' : 'var(--color-accent-deep)',
        }}
      >
        {modeLabel}
      </span>
      {summary.model ? <span style={{ marginLeft: 6 }}>{summary.model}</span> : null}
      <span style={{ marginLeft: 6 }}>{parts.slice(1).join(' · ')}</span>
    </div>
  )
}
