import { memo, useState } from 'react'
import type { OcMessage, OcMessagePart, OcPendingQuestionRequest } from '@/shared/types/opencode'
import { transcriptAnchorKeyForPart } from '@/entities/action/lib/actionMapping'
import AgentInfo from './AgentInfo'
import { renderMarkdown } from '@/shared/lib/format/markdown'
import ToolCallView from './ToolCallView'
import UserMessage from './UserMessage'
import MermaidBlock from './MermaidBlock'
import { DEFAULT_ACTION_TYPE_PALETTE_ID, getActionTypeTriad } from '@/shared/styles/actionTypePalettes'
import { getActionFlowIconSvg } from '@/widgets/action-flow/ui/actionFlowIcons'

interface MessageBubbleProps {
  message: OcMessage
  staleToolCallIds: Set<string>
  /** Wall clock for tool status when computing anchor keys */
  transcriptAnchorNowMs: number
  isLastInTurn: boolean
  /** Directory header for POST /question replies in multi-workspace setups */
  sessionDirectory?: string
  /** Session id used for editing a user message (revert + resend) */
  sessionId?: string
  /** Ask the composer to enter edit mode for a user message */
  onRequestEdit?: (messageID: string, text: string) => void
  /** Pending question from SSE (`question.asked`) — carries request id for inline submit */
  ssePendingQuestion?: OcPendingQuestionRequest | null
  /** Refresh transcript after inline question answers */
  onQuestionAnswered?: () => Promise<void>
}

export default memo(function MessageBubble({
  message,
  staleToolCallIds,
  transcriptAnchorNowMs,
  isLastInTurn,
  sessionDirectory,
  sessionId,
  onRequestEdit,
  ssePendingQuestion,
  onQuestionAnswered,
}: MessageBubbleProps) {
  const { info, parts } = message
  const isUser = info.role === 'user'

  if (isUser) {
    return <UserMessage message={message} sessionId={sessionId} onRequestEdit={onRequestEdit} />
  }

  // Assistant message
  return (
    <div style={{ padding: '4px 0' }}>
      {parts.length === 0 ? (
        // Message created by the server mid-stream but not yet carrying parts —
        // show a "thinking / writing" indicator instead of a blank card.
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.6,
            color: 'var(--color-text-tertiary)',
          }}
        >
          <span className="vt-streaming-caret" aria-hidden="true" />
          &nbsp;печатает…
        </div>
      ) : (
        parts.map((part, idx) => (
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
        ))
      )}
      {isLastInTurn && <AgentInfo info={info} />}
    </div>
  )
}, bubblePropsEqual)

function bubblePropsEqual(prev: MessageBubbleProps, next: MessageBubbleProps): boolean {
  return (
    prev.message === next.message &&
    prev.staleToolCallIds === next.staleToolCallIds &&
    prev.isLastInTurn === next.isLastInTurn &&
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

/** Splits text into normal markdown segments and fenced ```mermaid blocks. */
function splitMermaidBlocks(text: string): Array<{ type: 'md' | 'mermaid'; text?: string; code?: string }> {
  const segments: Array<{ type: 'md' | 'mermaid'; text?: string; code?: string }> = []
  const re = /```mermaid\s*\n([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: 'md', text: text.slice(last, m.index) })
    segments.push({ type: 'mermaid', code: m[1]! })
    last = re.lastIndex
  }
  if (last < text.length) segments.push({ type: 'md', text: text.slice(last) })
  if (segments.length === 0) segments.push({ type: 'md', text })
  return segments
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
  const [expanded, setExpanded] = useState(false)
  switch (part.type) {
    case 'text': {
      const ak = transcriptAnchorKeyForPart(
        message,
        part,
        partIndex,
        transcriptAnchorNowMs,
        staleToolCallIds,
      )
      const segments = splitMermaidBlocks(part.text || '')
      const isStreamingEmpty = message.info.role === 'assistant' && !part.text
      const inner = isStreamingEmpty ? (
        <span className="vt-streaming-caret" aria-hidden="true" />
      ) : (
        segments.length === 1 &&
        segments[0]!.type === 'md' && (
          <span dangerouslySetInnerHTML={{ __html: renderMarkdown(part.text || '') }} />
        )
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
        >
          {inner ??
            segments.map((seg, i) =>
              seg.type === 'mermaid' && seg.code !== undefined ? (
                <MermaidBlock key={i} code={seg.code} />
              ) : (
                <span
                  key={i}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(seg.text ?? '') }}
                />
              ),
            )}
        </div>
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
      const triad = getActionTypeTriad(DEFAULT_ACTION_TYPE_PALETTE_ID, 'Think')
      const thinkIcon = getActionFlowIconSvg('Think').replace(
        /<svg\b/,
        '<svg width="12" height="12"',
      )
      return (
        <div
          data-transcript-action-key={ak ?? undefined}
          style={{
            fontSize: 12,
            color: 'var(--color-text-tertiary)',
            margin: '4px 0',
            border: '1px solid var(--color-border-light)',
            borderRadius: '6px',
            overflow: 'hidden',
          }}
        >
          <div
            onClick={() => setExpanded(!expanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              background: 'var(--color-bg-soft)',
              cursor: 'pointer',
            }}
          >
            {/* Think swatch — matches the right-panel ActionType block */}
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 3,
                boxSizing: 'border-box',
                background: triad.fill,
                border: `1.5px solid ${triad.stroke}`,
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: triad.accent,
              }}
              dangerouslySetInnerHTML={{ __html: thinkIcon }}
            />
            <span style={{ fontSize: 11, fontWeight: 600, color: triad.accent }}>think</span>
            <span
              style={{
                fontSize: 10,
                color: 'var(--color-text-tertiary)',
                fontFamily: 'IBM Plex Mono, monospace',
                marginLeft: 'auto',
              }}
            >
              {expanded ? '▲' : '▼'}
            </span>
          </div>
          {expanded && (
            <div
              style={{
                borderTop: '1px solid var(--color-border-light)',
                padding: '8px 10px',
                background: 'var(--color-bg-white)',
                lineHeight: 1.5,
                overflowWrap: 'break-word',
                wordBreak: 'break-word',
              }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(part.text || '') }}
            />
          )}
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
