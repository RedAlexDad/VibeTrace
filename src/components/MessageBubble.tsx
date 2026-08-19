import { useState, useEffect } from 'react'
import type {
  OcMessage,
  OcMessagePart,
  OcMessageInfo,
  OcPendingQuestionRequest,
  OcQuestionInfo,
  ToolPart,
} from '../types/opencode'
import { stripHarnessGuidanceForDisplay } from '../config/harnessGuidance'
import { getPendingQuestions, replyToQuestion, rejectQuestion } from '../services/opencodeApi'
import {
  findQuestionRequestIdForToolPart,
  findRequestIdFromSsePending,
  parseQuestionInputQuestions,
} from '../utils/questionPart'
import { transcriptAnchorKeyForPart } from '../utils/actionMapping'

interface MessageBubbleProps {
  message: OcMessage
  staleToolCallIds: Set<string>
  /** Wall clock for tool status when computing anchor keys */
  transcriptAnchorNowMs: number
  isLastInTurn: boolean
  /** Directory header for POST /question replies in multi-workspace setups */
  sessionDirectory?: string
  /** Pending question from SSE (`question.asked`) — carries request id for inline submit */
  ssePendingQuestion?: OcPendingQuestionRequest | null
  /** Refresh transcript after inline question answers */
  onQuestionAnswered?: () => Promise<void>
}

/** Minimal markdown pass (fixed font size, italic disabled) */
function renderMarkdown(text: string): string {
  if (!text) return ''
  return text
    // fenced code
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:var(--color-bg-soft);padding:8px;border-radius:4px;margin:6px 0;font-family:IBM Plex Mono,monospace;font-size:11px"><code>$2</code></pre>')
    // inline code
    .replace(/`([^`]+)`/g, '<code style="background:var(--color-bg-soft);padding:1px 3px;border-radius:2px;font-family:IBM Plex Mono,monospace;font-size:11px">$1</code>')
    // Tables
    .replace(/(\|.+\|)\n(\|[-:| ]+\|)\n((?:\|.+\|\n?)*)/g, (_match, header, _divider, rows) => {
      const headerCells = header.split('|').filter((c: string) => c.trim())
      const rowLines = rows.trim().split('\n')
      const bodyCells = rowLines.map((row: string) => row.split('|').filter((c: string) => c.trim()))
      let html = '<table style="border-collapse:collapse;margin:8px 0;font-size:11px">'
      html += '<thead><tr>' + headerCells.map((c: string) => `<th style="border:1px solid var(--color-border-light);padding:4px 8px;background:var(--color-bg-soft);font-weight:600">${c}</th>`).join('') + '</tr></thead>'
      html += '<tbody>'
      bodyCells.forEach((cells: string[]) => {
        html += '<tr>' + cells.map((c: string) => `<td style="border:1px solid var(--color-border-light);padding:4px 8px">${c}</td>`).join('') + '</tr>'
      })
      html += '</tbody></table>'
      return html
    })
    // **bold** -> strong
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // *italic* -> just text (no italic)
    .replace(/\*(.+?)\*/g, '$1')
    // Headers collapse to bold
    .replace(/^#{1,6} (.+)$/gm, '<strong>$1</strong>')
    // bullet lists
    .replace(/^- (.+)$/gm, '<div style="margin-left:16px">• $1</div>')
    // numbered lists
    .replace(/^\d+\. (.+)$/gm, '<div style="margin-left:16px">$1</div>')
    // Paragraph breaks
    .replace(/\n\n/g, '</p><p style="margin:6px 0">')
    // Soft line breaks
    .replace(/\n/g, '<br/>')
}

/** User bubbles: payload usually lives under text parts while `info.content` may stay empty */
function userMessageDisplayText(message: OcMessage): string {
  const c = message.info.content?.trim()
  if (c) return message.info.content!
  const fromParts = message.parts
    .filter((p): p is Extract<OcMessagePart, { type: 'text' }> => p.type === 'text')
    .map(p => p.text || '')
    .join('')
    .trim()
  return fromParts
}

/** Chat column strips harness preamble regardless of toggle state */
function userMessageBodyForDisplay(message: OcMessage): string {
  return stripHarnessGuidanceForDisplay(userMessageDisplayText(message))
}

export default function MessageBubble({
  message,
  staleToolCallIds,
  transcriptAnchorNowMs,
  isLastInTurn,
  sessionDirectory,
  ssePendingQuestion,
  onQuestionAnswered,
}: MessageBubbleProps) {
  const { info, parts } = message
  const isUser = info.role === 'user'

  if (isUser) {
    return <UserMessage message={message} />
  }

  // Assistant message
  return (
    <div style={{ padding: '4px 0' }}>
      {parts.map((part, idx) => (
        <PartView
          key={idx}
          message={message}
          part={part}
          partIndex={idx}
          staleToolCallIds={staleToolCallIds}
          transcriptAnchorNowMs={transcriptAnchorNowMs}
          sessionDirectory={sessionDirectory}
          ssePendingQuestion={ssePendingQuestion}
          onQuestionAnswered={onQuestionAnswered}
        />
      ))}
      {isLastInTurn && <AgentInfo info={info} />}
    </div>
  )
}

function UserMessage({ message }: { message: OcMessage }) {
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
      style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 0', position: 'relative' }}
      onMouseEnter={() => setShowCopy(true)}
      onMouseLeave={() => setShowCopy(false)}
    >
      <div
        style={{
          maxWidth: '70%',
          padding: '8px 12px',
          background: 'var(--color-bg-white)',
          border:'1px solid var(--color-border-light)',
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
            border:'1px solid var(--color-border-light)',
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

function AgentInfo({ info }: { info: OcMessageInfo }) {
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
    <div style={{ marginTop: '8px', fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', gap: '12px' }}>
      {modelName && <span>{modelName}</span>}
      {duration && <span>{duration}</span>}
      {totalTokens && <span>{totalTokens} tokens</span>}
    </div>
  )
}

function PartView({
  message,
  part,
  partIndex,
  staleToolCallIds,
  transcriptAnchorNowMs,
  sessionDirectory,
  ssePendingQuestion,
  onQuestionAnswered,
}: {
  message: OcMessage
  part: OcMessagePart
  partIndex: number
  staleToolCallIds: Set<string>
  transcriptAnchorNowMs: number
  sessionDirectory?: string
  ssePendingQuestion?: OcPendingQuestionRequest | null
  onQuestionAnswered?: () => Promise<void>
}) {
  switch (part.type) {
    case 'text': {
      const ak = transcriptAnchorKeyForPart(
        message,
        part,
        partIndex,
        transcriptAnchorNowMs,
        staleToolCallIds,
      )
      return (
        <div
          data-transcript-action-key={ak ?? undefined}
          style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-primary)' }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(part.text || '') }}
        />
      )
    }

    case 'reasoning': {
      const ak = transcriptAnchorKeyForPart(
        message,
        part,
        partIndex,
        transcriptAnchorNowMs,
        staleToolCallIds,
      )
      return (
        <div
          data-transcript-action-key={ak ?? undefined}
          style={{
            fontSize: 12,
            color: 'var(--color-text-tertiary)',
            margin: '4px 0',
            padding: '6px 10px',
            background: 'var(--color-bg-subtle)',
            borderRadius: '4px',
            lineHeight: 1.5,
          }}
        >
          {part.text}
        </div>
      )
    }

    case 'tool': {
      const ak = transcriptAnchorKeyForPart(
        message,
        part,
        partIndex,
        transcriptAnchorNowMs,
        staleToolCallIds,
      )
      return (
        <div data-transcript-action-key={ak ?? undefined} style={{ margin: '4px 0' }}>
          <ToolCallView
            part={part}
            sessionDirectory={sessionDirectory}
            ssePendingQuestion={ssePendingQuestion}
            onQuestionAnswered={onQuestionAnswered}
          />
        </div>
      )
    }

    case 'text-file':
      return (
        <div style={{
          fontSize: 11,
          background: 'var(--color-bg-soft)',
          padding: '6px 10px',
          borderRadius: '4px',
          margin: '4px 0',
          fontFamily: 'IBM Plex Mono, monospace',
          whiteSpace: 'pre-wrap',
          color: 'var(--color-text-secondary)',
          overflow: 'hidden',
        }}>
          [{part.path}]
        </div>
      )

    case 'image': {
      const url = part.source?.data
        ? `data:${part.source.media_type};base64,${part.source.data}`
        : null
      return (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '4px 0' }}>
          {url ? <img src={url} alt="image" style={{ maxWidth: '150px', borderRadius: '4px' }} /> : '[image]'}
        </div>
      )
    }

    case 'compaction': {
      const ak = transcriptAnchorKeyForPart(
        message,
        part,
        partIndex,
        transcriptAnchorNowMs,
        staleToolCallIds,
      )
      return (
        <div
          data-transcript-action-key={ak ?? undefined}
          style={{
            fontSize: 10,
            color: 'var(--color-error-text)',
            margin: '4px 0',
            fontFamily: 'var(--font-family-mono)',
          }}
        >
          [compaction]
        </div>
      )
    }

    case 'step-start':
    case 'step-end':
    case 'step-finish':
      return null

    default:
      return null
  }
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

function ToolCallView({
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

  const questionItems =
    toolName === 'question' ? parseQuestionInputQuestions(state?.input) : []
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
    <div style={{ border:'1px solid var(--color-border-light)', borderRadius: '6px', overflow: 'hidden' }}>
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
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--color-text-primary)' }}>{toolName}</span>
        {status && (
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: '8px' }}>{status}</span>
        )}
        {hasError && (
          <span style={{ fontSize: 10, color: 'var(--color-error-text)', marginLeft: '8px' }}>
            {parsedError.name || 'Error'}
          </span>
        )}
        {hasDetails && (
          <span style={{ marginLeft: 'auto', color: 'var(--color-text-muted)', fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
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
        <div style={{ borderTop:'1px solid var(--color-border-light)', background: 'var(--color-bg-white)' }}>
          <div style={{ display: 'flex', gap: 4, padding: '6px 8px', borderBottom:'1px solid var(--color-border-faint)' }}>
            {hasInput && (
              <button
                onClick={() => setActiveTab('input')}
                style={{
                  border:'1px solid var(--color-border-light)',
                  background: activeTab === 'input' ? 'var(--color-bg-soft)' : 'var(--color-bg-white)',
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
                  border:'1px solid var(--color-border-light)',
                  background: activeTab === 'output' ? 'var(--color-bg-soft)' : 'var(--color-bg-white)',
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
                  border:'1px solid var(--color-border-light)',
                  background: activeTab === 'error' ? 'var(--color-error-soft)' : 'var(--color-bg-white)',
                  color: 'var(--color-error-text)',
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
          <div style={{
            padding: '8px 10px',
            fontSize: 11,
            fontFamily: 'IBM Plex Mono, monospace',
            whiteSpace: 'pre-wrap',
            color: activeTab === 'error' ? 'var(--color-error-text)' : 'var(--color-text-secondary)',
            background: activeTab === 'error' ? 'var(--color-error-soft)' : 'var(--color-bg-white)',
            maxHeight: '220px',
            overflowY: 'auto',
            overflowX: 'hidden',
            wordBreak: 'break-all',
          }}>
            {activeTab === 'input' && (inputText || '(empty input)')}
            {activeTab === 'output' && (output || '(empty output)')}
            {activeTab === 'error' && (
              `${parsedError.name || 'Tool Error'}\n${parsedError.text || errorRaw || ''}`.trim()
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function QuestionInlineForm({
  part,
  questions,
  directory,
  ssePendingQuestion,
  onDone,
}: {
  part: ToolPart
  questions: OcQuestionInfo[]
  directory?: string
  ssePendingQuestion?: OcPendingQuestionRequest | null
  onDone?: () => Promise<void>
}) {
  const [selections, setSelections] = useState<string[][]>(() => questions.map(() => []))
  const [customTexts, setCustomTexts] = useState<string[]>(() => questions.map(() => ''))
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setSelections(questions.map(() => []))
    setCustomTexts(questions.map(() => ''))
  }, [part.id, part.callID, questions.length])

  const setQuestionSelection = (qi: number, labels: string[]) => {
    setSelections((prev) => {
      const next = [...prev]
      next[qi] = labels
      return next
    })
  }

  const toggleOption = (q: OcQuestionInfo, qi: number, label: string) => {
    const cur = selections[qi] ?? []
    if (q.multiple) {
      const has = cur.includes(label)
      setQuestionSelection(qi, has ? cur.filter((l) => l !== label) : [...cur, label])
    } else {
      setQuestionSelection(qi, [label])
    }
  }

  const buildAnswers = (): string[][] | null => {
    const out: string[][] = []
    for (let qi = 0; qi < questions.length; qi++) {
      const q = questions[qi]!
      const selected = [...(selections[qi] ?? [])]
      const extra = (customTexts[qi] ?? '').trim()
      const allowCustom = q.custom !== false
      if (selected.length > 0) {
        out.push(selected)
      } else if (extra && allowCustom) {
        out.push([extra])
      } else {
        return null
      }
    }
    return out
  }

  const resolveRequestId = async (): Promise<string | undefined> => {
    const fromSse = findRequestIdFromSsePending(ssePendingQuestion, part)
    if (fromSse) {
      return fromSse
    }
    const delaysMs = [0, 200, 500, 1000]
    for (let i = 0; i < delaysMs.length; i++) {
      const d = delaysMs[i]!
      if (d > 0) await new Promise((r) => setTimeout(r, d))
      try {
        const list = await getPendingQuestions(directory, { sessionID: part.sessionID })
        const id = findQuestionRequestIdForToolPart(list, part)
        if (id) return id
      } catch {
        /* retry */
      }
    }
    return undefined
  }

  const submit = async () => {
    const answers = buildAnswers()
    if (!answers) {
      window.alert('Pick at least one answer per prompt, or fill the custom field where allowed.')
      return
    }
    setSubmitting(true)
    try {
      const requestId = await resolveRequestId()
      if (!requestId) {
        window.alert(
          'Could not correlate this question request. Verify OpenCode exposes GET /question and the workspace directory matches.'
        )
        return
      }
      await replyToQuestion(requestId, answers, directory)
      await onDone?.()
    } catch {
      window.alert('Submission failed — ensure POST /question/{requestID}/reply exists on your server.')
    } finally {
      setSubmitting(false)
    }
  }

  const reject = async () => {
    setSubmitting(true)
    try {
      const requestId = await resolveRequestId()
      if (requestId) {
        await rejectQuestion(requestId, directory)
      }
      await onDone?.()
    } catch {
      window.alert('Unable to dismiss this question.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        padding: '10px 12px',
        background:'linear-gradient(180deg, var(--color-accent-softer) 0%, var(--color-bg-white) 100%)',
        borderTop:'1px solid var(--color-border-faint)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {questions.map((q, qi) => (
          <div
            key={`inline-q-${qi}`}
            style={{
              border:'1px solid var(--color-border-light)',
              borderRadius: 8,
              padding: '8px 10px',
              background: 'var(--color-bg-white)',
            }}
          >
            {q.header ? (
              <div style={{ fontSize: 10, color: 'var(--color-accent)', marginBottom: 4 }}>{q.header}</div>
            ) : null}
            <div style={{ fontSize: 12, color: 'var(--color-text-primary)', lineHeight: 1.5, marginBottom: 8 }}>{q.question}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {q.options.map((opt) => {
                const sel = selections[qi] ?? []
                const checked = q.multiple ? sel.includes(opt.label) : sel[0] === opt.label
                return (
                  <label
                    key={opt.label}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      fontSize: 11,
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    <input
                      type={q.multiple ? 'checkbox' : 'radio'}
                      name={`inline-q-${part.id}-${qi}`}
                      checked={checked}
                      disabled={submitting}
                      onChange={() => toggleOption(q, qi, opt.label)}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      <span style={{ fontWeight: 500 }}>{opt.label}</span>
                      {opt.description ? (
                        <span style={{ color: 'var(--color-text-tertiary)', display: 'block', marginTop: 2 }}>{opt.description}</span>
                      ) : null}
                    </span>
                  </label>
                )
              })}
            </div>
            {q.custom !== false && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Notes (optional)</div>
                <input
                  type="text"
                  value={customTexts[qi] ?? ''}
                  disabled={submitting}
                  onChange={(e) => {
                    const v = e.target.value
                    setCustomTexts((prev) => {
                      const next = [...prev]
                      next[qi] = v
                      return next
                    })
                  }}
                  placeholder="Add context when the preset options are not enough"
                  style={{
                    width: '100%',
                    fontSize: 11,
                    padding: '6px 8px',
                    border:'1px solid var(--color-border-light)',
                    borderRadius: 6,
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void reject()}
          style={{
            fontSize: 11,
            padding: '6px 12px',
            borderRadius: 6,
            border:'1px solid var(--color-border-light)',
            background: 'var(--color-bg-white)',
            color: 'var(--color-text-secondary)',
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          Skip
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void submit()}
          style={{
            fontSize: 11,
            padding: '6px 16px',
            borderRadius: 6,
            border: 'none',
            background: submitting ? 'var(--color-accent-muted)' : 'var(--color-accent)',
            color: 'var(--color-on-accent)',
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Sending…' : 'Submit'}
        </button>
      </div>
    </div>
  )
}
