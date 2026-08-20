import { useLayoutEffect, useRef, useState } from 'react'
import { SHOW_COMPOSER_MODEL_UI } from '@/shared/config/featureFlags'
import { prepareOutgoingFromFiles } from '@/entities/message/lib/messageAttachments'
import ComposerModelSelector from './ComposerModelSelector'
import {
  type MessageInputProps,
  type MessageSendPayload,
  FONT_SIZE,
  LINE_HEIGHT,
  MIN_ROWS,
  MIN_H,
  MAX_H,
} from './types'

export type { MessageSendPayload }

export default function MessageInput({
  onSend,
  onAbort,
  disabled,
  isRunning,
  aborting,
  agentName,
  modelName,
  composerModelRef = '',
  onComposerModelRefChange,
  composerModelOptions = [],
  composerModelsLoading = false,
  composerModelsError = null,
  envBootstrapModel = null,
}: MessageInputProps) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(Math.max(el.scrollHeight, MIN_H), MAX_H)
    el.style.height = `${next}px`
  }, [text])

  const canSend = (text.trim().length > 0 || files.length > 0) && !sending && !disabled
  const canAbort = Boolean(isRunning && onAbort && !aborting && !disabled)

  const handleSend = async () => {
    if (!canSend) return
    const prevText = text
    const prevFiles = files
    // Clear immediately so long requests don’t leave stale text in the composer
    setText('')
    setFiles([])
    setSending(true)
    setAttachError(null)
    try {
      const { combinedText, images } = await prepareOutgoingFromFiles(prevFiles, prevText)
      await onSend({ combinedText, imageParts: images })
    } catch (err) {
      // Restore draft on failure
      setText(prevText)
      setFiles(prevFiles)
      const msg = err instanceof Error ? err.message : String(err)
      setAttachError(msg)
    } finally {
      setSending(false)
    }
  }

  const handleAbort = async () => {
    if (!canAbort || !onAbort) return
    try {
      await onAbort()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setAttachError(msg)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const onPickFiles = () => {
    setAttachError(null)
    fileInputRef.current?.click()
  }

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list?.length) return
    setFiles((prev) => [...prev, ...Array.from(list)])
    e.target.value = ''
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div style={{ padding: '10px 16px' }}>
      {SHOW_COMPOSER_MODEL_UI && (
        <ComposerModelSelector
          composerModelRef={composerModelRef}
          onComposerModelRefChange={onComposerModelRefChange}
          composerModelOptions={composerModelOptions}
          composerModelsLoading={composerModelsLoading}
          composerModelsError={composerModelsError}
          envBootstrapModel={envBootstrapModel}
          disabled={disabled}
        />
      )}

      <div
        style={{
          background: 'var(--color-bg-white)',
          border: '1px solid var(--color-border-light)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask something…"
          disabled={disabled || sending}
          rows={MIN_ROWS}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            minHeight: MIN_H,
            maxHeight: MAX_H,
            overflowY: 'auto',
            padding: '10px 12px',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            color: 'var(--color-text-primary)',
            fontSize: FONT_SIZE,
            lineHeight: LINE_HEIGHT,
            fontFamily: 'inherit',
          }}
        />

        {files.length > 0 && (
          <div
            style={{
              padding: '4px 10px 6px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              borderTop: '1px solid var(--color-border-faint)',
            }}
          >
            {files.map((f, i) => (
              <span
                key={`${f.name}-${i}-${f.size}`}
                style={{
                  fontSize: 11,
                  color: 'var(--color-text-secondary)',
                  background: 'var(--color-bg-soft)',
                  borderRadius: 4,
                  padding: '2px 8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  maxWidth: '100%',
                }}
              >
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {f.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 14,
                    lineHeight: 1,
                    color: 'var(--color-text-tertiary)',
                  }}
                  aria-label="Remove attachment"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '8px 10px',
            borderTop: '1px solid var(--color-border-faint)',
            background: 'var(--color-bg-subtle)',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            accept="image/*,.txt,.md,.json,.jsonc,.csv,.ts,.tsx,.js,.jsx,.css,.html,.xml,.yaml,.yml,.log,.env,.rs,.go,.py,.vue"
            onChange={onFileInputChange}
          />
          <button
            type="button"
            onClick={onPickFiles}
            disabled={disabled || sending}
            title="Attach images or text files"
            style={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-bg-white)',
              border: '1px solid var(--color-border-light)',
              borderRadius: 6,
              cursor: disabled || sending ? 'not-allowed' : 'pointer',
              opacity: disabled || sending ? 0.5 : 1,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-text-secondary)"
              strokeWidth="2"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => void (canAbort ? handleAbort() : handleSend())}
            disabled={canAbort ? false : !canSend}
            style={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: canAbort
                ? 'var(--color-error-soft)'
                : canSend
                  ? 'var(--color-accent-strong)'
                  : 'var(--color-bg-soft)',
              border: 'none',
              borderRadius: 6,
              cursor: canAbort || canSend ? 'pointer' : 'not-allowed',
              opacity: sending ? 0.7 : 1,
            }}
          >
            {canAbort ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-error-text)"
                strokeWidth="2"
              >
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={canSend ? 'white' : 'var(--color-text-muted)'}
                strokeWidth="2"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {attachError && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-error-text)' }}>
          {attachError}
        </div>
      )}

      {(agentName || modelName) && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            display: 'flex',
            gap: 12,
          }}
        >
          {agentName && <span>{agentName}</span>}
          {modelName && <span>{modelName}</span>}
        </div>
      )}
    </div>
  )
}
