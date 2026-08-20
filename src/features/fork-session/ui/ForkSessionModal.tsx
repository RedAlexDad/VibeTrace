import { useState, useEffect } from 'react'

const fontSans =
  "'Segoe UI', system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"

type Props = {
  open: boolean
  submitting: boolean
  onClose: () => void
  onConfirm: (prompt: string) => void | Promise<void>
}

export default function ForkSessionModal({ open, submitting, onClose, onConfirm }: Props) {
  const [prompt, setPrompt] = useState('')

  useEffect(() => {
    if (open) setPrompt('')
  }, [open])

  if (!open) return null

  const canSubmit = !submitting

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fork-session-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.45)',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div
        style={{
          width: 'min(400px, 92vw)',
          maxHeight: 'min(70vh, 480px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-bg-white)',
          borderRadius: 14,
          boxShadow: '0 18px 48px rgba(15, 23, 42, 0.18)',
          border: '1px solid var(--color-border-light)',
          overflow: 'hidden',
          fontFamily: fontSans,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--color-border-faint)' }}
        >
          <h2
            id="fork-session-modal-title"
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              lineHeight: '22px',
            }}
          >
            Fork session
          </h2>
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              lineHeight: 1.45,
            }}
          >
            Enter the <strong>first user message</strong> for the forked session, then confirm.
          </p>
        </div>
        <div
          style={{
            padding: '12px 16px',
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <label
            htmlFor="fork-prompt-input"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--color-text-tertiary)',
              marginBottom: 6,
            }}
          >
            Message
          </label>
          <textarea
            id="fork-prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="First message after fork…"
            rows={5}
            disabled={submitting}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
              minHeight: 96,
              padding: '10px 12px',
              fontSize: 13,
              lineHeight: 1.45,
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              fontFamily: fontSans,
              outline: 'none',
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '12px 16px 14px',
            borderTop: '1px solid var(--color-border-faint)',
            background: 'var(--color-bg-soft)',
          }}
        >
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-white)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: fontSans,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void onConfirm(prompt)}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              borderRadius: 8,
              border: 'none',
              background: canSubmit ? 'var(--color-text-primary)' : 'var(--color-border-light)',
              color: 'var(--color-on-accent)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: fontSans,
            }}
          >
            {submitting ? 'Working…' : 'Fork'}
          </button>
        </div>
      </div>
    </div>
  )
}
