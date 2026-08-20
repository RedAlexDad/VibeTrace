import { useState } from 'react'
import type { OcMessage } from '@/shared/types/opencode'
import { userMessageBodyForDisplay } from './text'

export default function UserMessage({ message }: { message: OcMessage }) {
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
