import { useState, useEffect } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { ToolPart } from '@/shared/types/opencode'
import { mapToolToActionType } from '@/entities/action/lib/actionMapping'
import {
  DEFAULT_ACTION_TYPE_PALETTE_ID,
  getActionTypeTriad,
} from '@/shared/styles/actionTypePalettes'
import { usePrefersDark } from '@/shared/lib/hooks/usePrefersDark'
import { actionFlowPalette } from '@/shared/styles/actionFlowPalette'
import { highlightJson } from '@/shared/lib/format/highlightJson'

// Tool name to SVG icon mapping
const toolIcons: Record<string, ReactElement> = {
  bash: (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  read_file: (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  write_to_file: (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  edit_file: (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  glob: (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  grep: (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  search_content: (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  fetch: (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  websearch: (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
}

// Default icon
const DefaultIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

interface ToolCallCardProps {
  part: ToolPart
  /** Rendered between the header and the content tabs (e.g. inline question form) */
  renderInline?: () => ReactNode
}

function extractToolError(errorRaw?: string): { name?: string; text?: string } {
  const raw = (errorRaw ?? '').trim()
  if (!raw) return {}
  const i = raw.indexOf(':')
  if (i <= 0) return { name: raw, text: raw }
  const name = raw.slice(0, i).trim()
  const text = raw.slice(i + 1).trim()
  return {
    name: name || raw,
    text: text || raw,
  }
}

const STATUS_TEXT: Record<string, string> = {
  running: actionFlowPalette.running.icon,
  pending: actionFlowPalette.pending.icon,
  completed: actionFlowPalette.completed.icon,
  error: 'var(--color-error-text)',
}

export default function ToolCallCard({ part, renderInline }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'input' | 'output' | 'error'>('input')
  usePrefersDark()

  const toolName = part.tool
  const state = part.state
  const input = state?.input
  const output = state?.output
  const status = state?.status
  const errorRaw = state?.error

  const hasInput = Boolean(input && Object.keys(input).length > 0)
  const hasOutput = Boolean(output && output.trim().length > 0)
  const hasError = Boolean(errorRaw && errorRaw.trim().length > 0)

  const parsedError = extractToolError(errorRaw)
  const errorTooltip = hasError
    ? `${parsedError.name ? `Error: ${parsedError.name}\n` : ''}${parsedError.text ?? errorRaw}`
    : undefined

  const hasDetails = hasInput || hasOutput || hasError
  const icon = toolIcons[toolName] || <DefaultIcon />

  const actionType = mapToolToActionType(toolName)
  const toolColor = actionType
    ? getActionTypeTriad(DEFAULT_ACTION_TYPE_PALETTE_ID, actionType).accent
    : 'var(--color-text-secondary)'
  const statusColor = status ? (STATUS_TEXT[status] ?? 'var(--color-text-tertiary)') : undefined

  let inputText = ''
  if (hasInput) {
    try {
      inputText = JSON.stringify(input, null, 2)
    } catch {
      inputText = String(input)
    }
  }

  const inputNodes = inputText ? highlightJson(inputText) : null

  useEffect(() => {
    if (hasError) {
      setActiveTab('error')
      return
    }
    if (hasOutput) {
      setActiveTab('output')
      return
    }
    setActiveTab('input')
  }, [part.id, hasError, hasOutput])

  return (
    <div
      style={{
        border: '1px solid var(--color-border-light)',
        borderRadius: '6px',
        overflow: 'hidden',
      }}
    >
      <div
        onClick={() => hasDetails && setExpanded(!expanded)}
        title={errorTooltip}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          background: 'var(--color-bg-subtle)',
          cursor: hasDetails ? 'pointer' : 'default',
          fontSize: 12,
        }}
      >
        <span style={{ color: toolColor, display: 'flex' }}>{icon}</span>
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: toolColor, fontWeight: 600 }}>
          {toolName}
        </span>
        {status && (
          <span
            style={{
              fontSize: 10,
              color: statusColor,
              fontWeight: 600,
              marginLeft: '8px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {status}
          </span>
        )}
        {hasError && (
          <span style={{ fontSize: 10, color: 'var(--color-error-text)', marginLeft: '8px' }}>
            {parsedError.name || 'Error'}
          </span>
        )}
        {hasDetails && (
          <span style={{ marginLeft: 'auto', color: 'var(--color-text-muted)', fontSize: 11 }}>
            {expanded ? '▲' : '▼'}
          </span>
        )}
      </div>
      {renderInline?.()}
      {hasDetails && expanded && (
        <div
          style={{
            borderTop: '1px solid var(--color-border-light)',
            background: 'var(--color-bg-white)',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: '6px 8px',
              borderBottom: '1px solid var(--color-border-faint)',
            }}
          >
            {hasInput && (
              <button
                onClick={() => setActiveTab('input')}
                style={{
                  border: '1px solid var(--color-border)',
                  background:
                    activeTab === 'input' ? 'var(--color-accent-soft)' : 'var(--color-bg-white)',
                  color:
                    activeTab === 'input'
                      ? 'var(--color-accent-deep)'
                      : 'var(--color-text-secondary)',
                  fontWeight: activeTab === 'input' ? 600 : 400,
                  borderRadius: 4,
                  fontSize: 10,
                  padding: '2px 6px',
                  cursor: 'pointer',
                }}
              >
                Input
              </button>
            )}
            {hasOutput && (
              <button
                onClick={() => setActiveTab('output')}
                style={{
                  border: '1px solid var(--color-border)',
                  background:
                    activeTab === 'output' ? 'var(--color-accent-soft)' : 'var(--color-bg-white)',
                  color:
                    activeTab === 'output'
                      ? 'var(--color-accent-deep)'
                      : 'var(--color-text-secondary)',
                  fontWeight: activeTab === 'output' ? 600 : 400,
                  borderRadius: 4,
                  fontSize: 10,
                  padding: '2px 6px',
                  cursor: 'pointer',
                }}
              >
                Output
              </button>
            )}
            {hasError && (
              <button
                onClick={() => setActiveTab('error')}
                style={{
                  border: '1px solid var(--color-border)',
                  background:
                    activeTab === 'error' ? 'var(--color-error-soft)' : 'var(--color-bg-white)',
                  color:
                    activeTab === 'error'
                      ? 'var(--color-error-text)'
                      : 'var(--color-text-secondary)',
                  fontWeight: activeTab === 'error' ? 600 : 400,
                  borderRadius: 4,
                  fontSize: 10,
                  padding: '2px 6px',
                  cursor: 'pointer',
                }}
              >
                Error
              </button>
            )}
          </div>
          <div
            style={{
              padding: '8px 10px',
              fontSize: 11,
              fontFamily: 'IBM Plex Mono, monospace',
              whiteSpace: 'pre-wrap',
              color:
                activeTab === 'error' ? 'var(--color-error-text)' : 'var(--color-text-secondary)',
              background:
                activeTab === 'error' ? 'var(--color-error-soft)' : 'var(--color-bg-white)',
              maxHeight: '220px',
              overflowY: 'auto',
              overflowX: 'hidden',
              wordBreak: 'break-all',
            }}
          >
            {activeTab === 'input' &&
              (inputNodes ?? (
                <span style={{ color: 'var(--color-text-muted)' }}>(empty input)</span>
              ))}
            {activeTab === 'output' && (output || '(empty output)')}
            {activeTab === 'error' &&
              `${parsedError.name || 'Tool Error'}\n${parsedError.text || errorRaw || ''}`.trim()}
          </div>
        </div>
      )}
    </div>
  )
}
