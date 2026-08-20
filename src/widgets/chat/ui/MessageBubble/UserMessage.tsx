import { useRef, useState } from 'react'
import type { OcMessage } from '@/shared/types/opencode'
import { userMessageBodyForDisplay } from './text'

type UserMessageProps = {
  message: OcMessage
  sessionId?: string
  onEditMessage?: (messageID: string, newText: string) => Promise<void>
}

export default function UserMessage({ message, sessionId, onEditMessage }: UserMessageProps) {
  const content = userMessageBodyForDisplay(message)
  const [showCopy, setShowCopy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content)
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const canEdit = Boolean(sessionId && onEditMessage)

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const startEditing = () => {
    setDraft(content)
    setEditing(true)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.select()
    })
  }

  const cancelEditing = () => {
    setEditing(false)
    setDraft(content)
  }

  const saveEdit = async () => {
    if (!sessionId || !onEditMessage || !message.info.id) return
    const next = draft.trim()
    if (!next || next === content) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onEditMessage(message.info.id, next)
      setEditing(false)
    } finally {
      setSaving(false)
    }
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
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minWidth: 120,
        }}
      >
        {editing ? (
          <>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void saveEdit()
                }
              }}
              rows={Math.min(8, Math.max(2, draft.split('\n').length))}
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                fontFamily: 'inherit',
                color: 'var(--color-text-primary)',
                background: 'var(--color-bg-white)',
                border: '1px solid var(--color-accent)',
                borderRadius: 6,
                padding: '6px 8px',
                resize: 'vertical',
                width: '100%',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={cancelEditing}
                disabled={saving}
                style={smallActionStyle}
              >
                cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={saving || !draft.trim()}
                style={{
                  ...smallActionStyle,
                  color: 'var(--color-accent)',
                  fontWeight: 600,
                }}
              >
                {saving ? 'sending…' : 'save & resend'}
              </button>
            </div>
          </>
        ) : (
          content || <span style={{ color: 'var(--color-text-muted)' }}>No text payload</span>
        )}
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
          {canEdit && !editing && (
            <button
              onClick={startEditing}
              title="Edit message"
              style={{ ...smallActionStyle, color: 'var(--color-text-tertiary)' }}
            >
              edit
            </button>
          )}
          {!editing && (
            <button onClick={handleCopy} style={{ ...smallActionStyle, color: copied ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
              {copied ? 'copied' : 'copy'}
            </button>
          )}
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
  cursor: 'pointer',
}
