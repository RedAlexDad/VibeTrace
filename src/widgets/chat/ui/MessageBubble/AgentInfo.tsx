import type { OcMessageInfo } from '@/shared/types/opencode'

export default function AgentInfo({ info }: { info: OcMessageInfo }) {
  const modelName = info.model?.modelID || null
  const totalTokens = info.tokens?.total || null

  let duration: string | null = null
  if (info.time?.completed && info.time?.created) {
    const ms = info.time.completed - info.time.created
    if (ms > 0) {
      duration = `${(ms / 1000).toFixed(1)}s`
    }
  }

  if (!modelName && !totalTokens && !duration) return null

  return (
    <div
      style={{
        marginTop: '8px',
        fontSize: 11,
        color: 'var(--color-text-tertiary)',
        display: 'flex',
        gap: '12px',
      }}
    >
      {modelName && <span>{modelName}</span>}
      {duration && <span>{duration}</span>}
      {totalTokens && <span>{totalTokens} tokens</span>}
    </div>
  )
}
