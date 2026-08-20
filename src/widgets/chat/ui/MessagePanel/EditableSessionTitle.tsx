import { useState, useEffect } from 'react'

export default function EditableSessionTitle({
  sessionId,
  title,
  loading,
  onCommit,
}: {
  sessionId: string
  title?: string
  loading: boolean
  onCommit?: (next: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title ?? '')
  const [saving, setSaving] = useState(false)

  const canEdit = Boolean(sessionId && onCommit && !loading)

  useEffect(() => {
    if (!editing) setDraft(title ?? '')
  }, [title, editing])

  const display = title?.trim() ? title : 'Untitled session'

  const startEdit = () => {
    if (!canEdit) return
    setDraft(title ?? '')
    setEditing(true)
  }

  const cancel = () => {
    setDraft(title ?? '')
    setEditing(false)
  }

  const commit = async () => {
    if (!onCommit) return
    const next = draft.trim()
    if (!next) {
      cancel()
      return
    }
    if (next === (title ?? '').trim()) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onCommit(next)
      setEditing(false)
    } catch {
      /* keep draft; server error surfaced elsewhere */
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit) {
    return (
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
        {display}
      </span>
    )
  }

  if (editing) {
    return (
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void commit()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        autoFocus
        disabled={saving}
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-accent)',
          borderRadius: 6,
          padding: '4px 8px',
          minWidth: 200,
          maxWidth: 'min(480px, 70vw)',
          outline: 'none',
          fontFamily: 'inherit',
        }}
      />
    )
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={startEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          startEdit()
        }
      }}
      style={{
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--color-text-primary)',
        cursor: 'pointer',
      }}
      title="Click to rename"
    >
      {display}
    </span>
  )
}