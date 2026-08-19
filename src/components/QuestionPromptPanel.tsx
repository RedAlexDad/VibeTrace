import { useState, useEffect } from 'react'
import type { OcPendingQuestionRequest, OcQuestionInfo } from '../types/opencode'

interface QuestionPromptPanelProps {
  request: OcPendingQuestionRequest
  disabled?: boolean
  submitting?: boolean
  onReply: (answers: string[][]) => Promise<void>
  onReject?: () => Promise<void>
}

/**
 * Renders OpenCode question prompts from SSE `question.asked`; submitted answers follow
 * POST `/question/{requestID}/reply` (selections are arrays of chosen option labels per prompt).
 */
export default function QuestionPromptPanel({
  request,
  disabled,
  submitting,
  onReply,
  onReject,
}: QuestionPromptPanelProps) {
  const { questions, id } = request
  /** Selected labels per prompt */
  const [selections, setSelections] = useState<string[][]>(() => questions.map(() => []))
  /** Free-text addon when prompts allow custom input */
  const [customTexts, setCustomTexts] = useState<string[]>(() => questions.map(() => ''))

  useEffect(() => {
    setSelections(questions.map(() => []))
    setCustomTexts(questions.map(() => ''))
  }, [id, questions])

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

  const submit = async () => {
    const answers = buildAnswers()
    if (!answers) {
      window.alert('Pick at least one answer per prompt, or fill the custom field where allowed.')
      return
    }
    await onReply(answers)
  }

  return (
    <div
      style={{
        borderTop: '1px solid var(--color-border-light)',
        background:
          'linear-gradient(180deg, var(--color-accent-softer) 0%, var(--color-bg-white) 100%)',
        padding: '12px 16px',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--color-accent-deep)',
          marginBottom: 10,
        }}
      >
        The agent needs your choice
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {questions.map((q, qi) => (
          <div
            key={`${id}-q-${qi}`}
            style={{
              border: '1px solid var(--color-border-light)',
              borderRadius: 8,
              padding: '10px 12px',
              background: 'var(--color-bg-white)',
            }}
          >
            {q.header ? (
              <div style={{ fontSize: 11, color: 'var(--color-accent)', marginBottom: 4 }}>
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
                      cursor: disabled || submitting ? 'not-allowed' : 'pointer',
                      fontSize: 11,
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    <input
                      type={q.multiple ? 'checkbox' : 'radio'}
                      name={`q-${id}-${qi}`}
                      checked={checked}
                      disabled={disabled || submitting}
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
                  disabled={disabled || submitting}
                  onChange={(e) => {
                    const v = e.target.value
                    setCustomTexts((prev) => {
                      const next = [...prev]
                      next[qi] = v
                      return next
                    })
                  }}
                  placeholder="Optional extra detail — submitted with your selection"
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
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        {onReject && (
          <button
            type="button"
            disabled={disabled || submitting}
            onClick={() => void onReject()}
            style={{
              fontSize: 11,
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--color-border-light)',
              background: 'var(--color-bg-white)',
              color: 'var(--color-text-secondary)',
              cursor: disabled || submitting ? 'not-allowed' : 'pointer',
            }}
          >
            Skip
          </button>
        )}
        <button
          type="button"
          disabled={disabled || submitting}
          onClick={() => void submit()}
          style={{
            fontSize: 11,
            padding: '6px 16px',
            borderRadius: 6,
            border: 'none',
            background: submitting ? 'var(--color-accent-muted)' : 'var(--color-accent)',
            color: 'var(--color-on-accent)',
            cursor: disabled || submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Sending…' : 'Submit'}
        </button>
      </div>
    </div>
  )
}
