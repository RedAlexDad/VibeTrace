import { useState } from 'react'
import type { OcMessage } from '@/shared/types/opencode'
import type { MessageSummary } from '@/entities/message/lib/messageSummary'
import { userMessageBodyForDisplay } from './text'
import MessageSummaryLine from './MessageSummaryLine'

export default function UserMessage({
  message,
  summary,
}: {
  message: OcMessage
  summary?: MessageSummary | null
}) {
  const content = userMessageBodyForDisplay(message)
  const [showCopy, setShowCopy] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '4px 0',
        position: 'relative',
        flexDirection: 'column',
        alignItems: 'flex-end',
      }}
      onMouseEnter={() => setShowCopy(true)}
      onMouseLeave={() => setShowCopy(false)}
    >
      <div
        style={{
          maxWidth: '70%',
          padding: '8px 12px',
          background: 'var(--color-bg-white)',
          border: '1px solid var(--color-border-light)',
          borderRadius: '12px',
          fontSize: 12,
          lineHeight: 1.5,
          color: 'var(--color-text-primary)',
          wordBreak: 'break-word',
        }}
      >
        {content || <span style={{ color: 'var(--color-text-muted)' }}>No text payload</span>}
      </div>
      {summary ? (
        <div style={{ maxWidth: '70%', width: '100%' }}>
          <MessageSummaryLine summary={summary} />
        </div>
      ) : null}
      {/* Copy button */}
      {showCopy && (
        <button
          onClick={handleCopy}
          style={{
            position: 'absolute',
            bottom: -4,
            right: 8,
            background: 'var(--color-bg-white)',
            border: '1px solid var(--color-border-light)',
            borderRadius: '4px',
            padding: '2px 6px',
            fontSize: 10,
            color: copied ? 'var(--color-success)' : 'var(--color-text-tertiary)',
            cursor: 'pointer',
          }}
        >
          {copied ? 'copied' : 'copy'}
        </button>
      )}
    </div>
  )
}
