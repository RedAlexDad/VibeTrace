import { useState } from 'react'
import type { OcMessage } from '@/shared/types/opencode'
import { userMessageBodyForDisplay } from './text'

type UserMessageProps = {
  message: OcMessage
  sessionId?: string
  /** Ask the composer to enter edit mode for this message. */
  onRequestEdit?: (messageID: string, text: string) => void
}

export default function UserMessage({ message, sessionId, onRequestEdit }: UserMessageProps) {
  const content = userMessageBodyForDisplay(message)
  const [showCopy, setShowCopy] = useState(false)
  const [copied, setCopied] = useState(false)

  const canEdit = Boolean(sessionId && onRequestEdit)

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
      {/* Copy + Edit buttons */}
      {showCopy && (
        <div
          style={{
            position: 'absolute',
            bottom: -4,
            right: 8,
            display: 'flex',
            gap: 4,
          }}
        >
          {canEdit && message.info.id && (
            <button
              onClick={() => onRequestEdit?.(message.info.id!, content)}
              title="Edit message"
              style={smallActionStyle}
            >
              edit
            </button>
          )}
          <button onClick={handleCopy} style={{ ...smallActionStyle, color: copied ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
            {copied ? 'copied' : 'copy'}
          </button>
        </div>
      )}
    </div>
  )
}

const smallActionStyle: React.CSSProperties = {
  background: 'var(--color-bg-white)',
  border: '1px solid var(--color-border-light)',
  borderRadius: 4,
  padding: '2px 6px',
  fontSize: 10,
  color: 'var(--color-text-tertiary)',
  cursor: 'pointer',
}
