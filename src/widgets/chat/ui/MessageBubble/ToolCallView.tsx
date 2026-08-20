import type { OcPendingQuestionRequest, ToolPart } from '@/shared/types/opencode'
import { parseQuestionInputQuestions } from '@/entities/message/lib/questionPart'
import ToolCallCard from '@/entities/message/ui/ToolCallCard'
import QuestionInlineForm from './QuestionInlineForm'

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
}
