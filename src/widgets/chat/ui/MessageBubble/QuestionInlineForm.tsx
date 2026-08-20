import { useState, useEffect } from 'react'
import type { OcPendingQuestionRequest, OcQuestionInfo, ToolPart } from '@/shared/types/opencode'
import {
  findQuestionRequestIdForToolPart,
  findRequestIdFromSsePending,
} from '@/entities/message/lib/questionPart'
import { getPendingQuestions, replyToQuestion, rejectQuestion } from '@/shared/api/opencodeApi'

export default function QuestionInlineForm({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          'Could not correlate this question request. Verify OpenCode exposes GET /question and the workspace directory matches.',
        )
        return
      }
      await replyToQuestion(requestId, answers, directory)
      await onDone?.()
    } catch {
      window.alert(
        'Submission failed — ensure POST /question/{requestID}/reply exists on your server.',
      )
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
        background:
          'linear-gradient(180deg, var(--color-accent-softer) 0%, var(--color-bg-white) 100%)',
        borderTop: '1px solid var(--color-border-light)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {questions.map((q, qi) => (
          <div
            key={`inline-q-${qi}`}
            style={{
              border: '1px solid var(--color-border-light)',
              borderRadius: 8,
              padding: '8px 10px',
              background: 'var(--color-bg-white)',
            }}
          >
            {q.header ? (
              <div style={{ fontSize: 10, color: 'var(--color-accent)', marginBottom: 4 }}>
                {q.header}
              </div>
            ) : null}
            <div
              style={{
                fontSize: 12,
                color: 'var(--color-text-primary)',
                lineHeight: 1.5,
                marginBottom: 8,
              }}
            >
              {q.question}
            </div>
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
                        <span
                          style={{
                            color: 'var(--color-text-tertiary)',
                            display: 'block',
                            marginTop: 2,
                          }}
                        >
                          {opt.description}
                        </span>
                      ) : null}
                    </span>
                  </label>
                )
              })}
            </div>
            {q.custom !== false && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>
                  Notes (optional)
                </div>
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
                    border: '1px solid var(--color-border-light)',
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
            border: '1px solid var(--color-border-light)',
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
