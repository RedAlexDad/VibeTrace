import { useState, useEffect } from 'react'
import type { OcPendingQuestionRequest, ToolPart } from '@/shared/types/opencode'
import { parseQuestionInputQuestions } from '@/entities/message/lib/questionPart'
import QuestionInlineForm from './QuestionInlineForm'

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

export default function ToolCallView({
  part,
  sessionDirectory,
  ssePendingQuestion,
  onQuestionAnswered,
}: {
  part: ToolPart
  sessionDirectory?: string
  ssePendingQuestion?: OcPendingQuestionRequest | null
  onQuestionAnswered?: () => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'input' | 'output' | 'error'>('input')
  const toolName = part.tool
  const state = part.state
  const input = state?.input
  const output = state?.output
  const hasInput = Boolean(input && Object.keys(input).length > 0)
  const hasOutput = Boolean(output && output.trim().length > 0)
  const status = state?.status
  const errorRaw = state?.error
  const hasError = Boolean(errorRaw && errorRaw.trim().length > 0)
  const parsedError = extractToolError(errorRaw)
  const errorTooltip = hasError
    ? `${parsedError.name ? `Error: ${parsedError.name}\n` : ''}${parsedError.text ?? errorRaw}`
    : undefined

  const questionItems = toolName === 'question' ? parseQuestionInputQuestions(state?.input) : []
  const showInlineQuestion =
    toolName === 'question' &&
    questionItems.length > 0 &&
    (status === 'running' || status === 'pending') &&
    !hasOutput
  const hasDetails = hasInput || hasOutput || hasError

  let inputText = ''
  if (hasInput) {
    try {
      inputText = JSON.stringify(input, null, 2)
    } catch {
      inputText = String(input)
    }
  }

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
          padding: '6px 10px',
          background: 'var(--color-bg-subtle)',
          cursor: hasDetails ? 'pointer' : 'default',
          fontSize: 12,
        }}
      >
        <span
          style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--color-text-primary)' }}
        >
          {toolName}
        </span>
        {status && (
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: '8px' }}>
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
      {showInlineQuestion && (
        <QuestionInlineForm
          part={part}
          questions={questionItems}
          directory={sessionDirectory}
          ssePendingQuestion={ssePendingQuestion}
          onDone={onQuestionAnswered}
        />
      )}
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
            {activeTab === 'input' && (inputText || '(empty input)')}
            {activeTab === 'output' && (output || '(empty output)')}
            {activeTab === 'error' &&
              `${parsedError.name || 'Tool Error'}\n${parsedError.text || errorRaw || ''}`.trim()}
          </div>
        </div>
      )}
    </div>
  )
}
