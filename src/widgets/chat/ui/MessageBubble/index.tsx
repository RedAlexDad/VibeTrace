import { memo } from 'react'
import type { OcMessage, OcMessagePart, OcPendingQuestionRequest } from '@/shared/types/opencode'
import { transcriptAnchorKeyForPart } from '@/entities/action/lib/actionMapping'
import type { MessageSummary } from '@/entities/message/lib/messageSummary'
import AgentInfo from './AgentInfo'
import { renderMarkdown } from '@/shared/lib/format/markdown'
import ToolCallView from './ToolCallView'
import UserMessage from './UserMessage'

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
  /** Summary shown under the last user message (stats of the following reply) */
  summary?: MessageSummary | null
}

export default memo(function MessageBubble({
  message,
  staleToolCallIds,
  transcriptAnchorNowMs,
  isLastInTurn,
  sessionDirectory,
  ssePendingQuestion,
  onQuestionAnswered,
  summary,
}: MessageBubbleProps) {
  const { info, parts } = message
  const isUser = info.role === 'user'

  if (isUser) {
    return <UserMessage message={message} summary={summary} />
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
}, bubblePropsEqual)

function bubblePropsEqual(prev: MessageBubbleProps, next: MessageBubbleProps): boolean {
  return (
    prev.message === next.message &&
    prev.staleToolCallIds === next.staleToolCallIds &&
    prev.isLastInTurn === next.isLastInTurn &&
    prev.summary === next.summary &&
    prev.sessionDirectory === next.sessionDirectory &&
    prev.ssePendingQuestion === next.ssePendingQuestion &&
    prev.onQuestionAnswered === next.onQuestionAnswered
  )
}

type PartViewProps = {
  message: OcMessage
  part: OcMessagePart
  partIndex: number
  staleToolCallIds: Set<string>
  transcriptAnchorNowMs: number
  sessionDirectory?: string
  ssePendingQuestion?: OcPendingQuestionRequest | null
  onQuestionAnswered?: () => Promise<void>
}

/** Ignore the wall-clock tick: anchor keys only matter for tool parts and don't
 * need a re-render every second. Re-render only when the part data actually changes. */
function partViewPropsEqual(prev: PartViewProps, next: PartViewProps): boolean {
  return (
    prev.message === next.message &&
    prev.part === next.part &&
    prev.partIndex === next.partIndex &&
    prev.staleToolCallIds === next.staleToolCallIds &&
    prev.sessionDirectory === next.sessionDirectory &&
    prev.ssePendingQuestion === next.ssePendingQuestion &&
    prev.onQuestionAnswered === next.onQuestionAnswered
  )
}

const PartView = memo(function PartView({
  message,
  part,
  partIndex,
  staleToolCallIds,
  transcriptAnchorNowMs,
  sessionDirectory,
  ssePendingQuestion,
  onQuestionAnswered,
}: PartViewProps) {
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
          style={{
            fontSize: 12,
            lineHeight: 1.6,
            color: 'var(--color-text-primary)',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
          }}
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
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
          }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(part.text || '') }}
        />
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
        <div
          style={{
            fontSize: 11,
            background: 'var(--color-bg-soft)',
            padding: '6px 10px',
            borderRadius: '4px',
            margin: '4px 0',
            fontFamily: 'IBM Plex Mono, monospace',
            whiteSpace: 'pre-wrap',
            color: 'var(--color-text-secondary)',
            overflow: 'hidden',
          }}
        >
          [{part.path}]
        </div>
      )

    case 'image': {
      const url = part.source?.data
        ? `data:${part.source.media_type};base64,${part.source.data}`
        : null
      return (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '4px 0' }}>
          {url ? (
            <img src={url} alt="image" style={{ maxWidth: '150px', borderRadius: '4px' }} />
          ) : (
            '[image]'
          )}
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
}, partViewPropsEqual)
