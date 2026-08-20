import { memo } from 'react'
import type { OcPendingQuestionRequest, ToolPart } from '@/shared/types/opencode'
import { parseQuestionInputQuestions } from '@/entities/message/lib/questionPart'
import ToolCallCard from '@/entities/message/ui/ToolCallCard'
import QuestionInlineForm from './QuestionInlineForm'

type ToolCallViewProps = {
  part: ToolPart
  sessionDirectory?: string
  ssePendingQuestion?: OcPendingQuestionRequest | null
  onQuestionAnswered?: () => Promise<void>
}

export default memo(function ToolCallView({
  part,
  sessionDirectory,
  ssePendingQuestion,
  onQuestionAnswered,
}: ToolCallViewProps) {
  const toolName = part.tool
  const state = part.state
  const status = state?.status
  const hasOutput = Boolean(state?.output && state.output.trim().length > 0)

  const questionItems = toolName === 'question' ? parseQuestionInputQuestions(state?.input) : []
  const showInlineQuestion =
    toolName === 'question' &&
    questionItems.length > 0 &&
    (status === 'running' || status === 'pending') &&
    !hasOutput

  return (
    <ToolCallCard
      part={part}
      renderInline={
        showInlineQuestion
          ? () => (
              <QuestionInlineForm
                part={part}
                questions={questionItems}
                directory={sessionDirectory}
                ssePendingQuestion={ssePendingQuestion}
                onDone={onQuestionAnswered}
              />
            )
          : undefined
      }
    />
  )
}, toolCallViewPropsEqual)

function toolCallViewPropsEqual(prev: ToolCallViewProps, next: ToolCallViewProps): boolean {
  if (prev.part !== next.part) return false
  if (prev.sessionDirectory !== next.sessionDirectory) return false
  if (prev.ssePendingQuestion !== next.ssePendingQuestion) return false
  return Boolean(prev.onQuestionAnswered) === Boolean(next.onQuestionAnswered)
}
