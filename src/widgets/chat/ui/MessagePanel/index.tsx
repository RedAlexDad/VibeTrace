import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { OcMessage, OcPendingQuestionRequest, OcTodo } from '@/shared/types/opencode'
import type { CanonicalTodo, LatestTodowriteBatchProgress } from '@/entities/todo/lib/todoRegistry'
import { buildSessionSummary } from '@/entities/message/lib/messageSummary'
import MessageBubble from '@/widgets/chat/ui/MessageBubble'
import MessageSummaryLine from '@/widgets/chat/ui/MessageBubble/MessageSummaryLine'
import TodoPanel from '@/widgets/todo-panel/ui/TodoPanel'
import MessageInput, { type MessageSendPayload } from '@/widgets/chat/ui/MessageInput'
import QuestionPromptPanel from '@/widgets/chat/ui/QuestionPromptPanel'
import { actionFlowPalette } from '@/shared/styles/actionFlowPalette'
import type { OcComposerModelOption } from '@/shared/api/opencodeApi'
import { messagesHaveOpenQuestionWithInput } from '@/entities/message/lib/questionPart'
import { collectStaleToolCallIDs } from '@/entities/action/lib/actionMapping'
import EditableSessionTitle from './EditableSessionTitle'

interface MessagePanelProps {
  messages: OcMessage[]
  latestTodos: CanonicalTodo[]
  archivedTodos: CanonicalTodo[]
  /** Progress for the batch tied to the latest todowrite snapshot; null when no snapshot exists */
  latestTodowriteBatchProgress: LatestTodowriteBatchProgress | null
  loading: boolean
  /** User message sent; polling until assistant reply arrives (SSE may lag) */
  waitingForAssistantReply?: boolean
  sessionId: string
  sessionTitle?: string
  onRefresh: () => void
  onSendMessage: (payload: MessageSendPayload) => Promise<void>
  onAbortMessage?: () => Promise<void>
  aborting?: boolean
  /** Scrollable message column ref (connector geometry) */
  messageListScrollRef?: RefObject<HTMLDivElement | null>
  /** Set by this panel so parents can scroll the virtualized list to an index. */
  messageScrollToIndexRef?: RefObject<((index: number) => void) | null>
  /** Todo list scroll container (highlight alignment) */
  todoPanelScrollRef?: RefObject<HTMLDivElement | null>
  /** Message indices highlighted for the active subtask */
  highlightMessageIndices?: Set<number> | null
  /** Todo ids highlighted during execution phase */
  highlightTodoIds?: Set<string> | null
  /** Incremented on subtask selection to auto-expand matching todo sections */
  todoPanelRevealGeneration?: number
  onTodoClick?: (todo: OcTodo) => void
  /** PATCH session title via OpenCode */
  onSessionTitleCommit?: (title: string) => Promise<void>
  /** OpenCode question channel requests (SSE `question.asked`) */
  pendingQuestion?: OcPendingQuestionRequest | null
  onQuestionReply?: (answers: string[][]) => Promise<void>
  onQuestionReject?: () => Promise<void>
  questionSubmitting?: boolean
  /** Workspace directory header (`x-opencode-directory`) for inline submits */
  sessionDirectory?: string
  /** Bubble-level question completion hook */
  onQuestionAnswered?: () => Promise<void>
  composerModelRef?: string
  onComposerModelRefChange?: (ref: string) => void
  composerModelOptions?: OcComposerModelOption[]
  composerModelsLoading?: boolean
  composerModelsError?: string | null
  envBootstrapModel?: string | null
  composerAgent?: 'build' | 'plan'
  onComposerAgentChange?: (agent: 'build' | 'plan') => void
}

export default function MessagePanel({
  messages,
  latestTodos,
  archivedTodos,
  latestTodowriteBatchProgress,
  loading,
  waitingForAssistantReply = false,
  sessionId,
  sessionTitle,
  onRefresh,
  onSendMessage,
  onAbortMessage,
  aborting,
  messageListScrollRef,
  messageScrollToIndexRef,
  todoPanelScrollRef,
  highlightMessageIndices,
  highlightTodoIds,
  todoPanelRevealGeneration,
  onTodoClick,
  onSessionTitleCommit,
  pendingQuestion,
  onQuestionReply,
  onQuestionReject,
  questionSubmitting,
  sessionDirectory,
  onQuestionAnswered,
  composerModelRef = '',
  onComposerModelRefChange,
  composerModelOptions = [],
  composerModelsLoading = false,
  composerModelsError = null,
  envBootstrapModel = null,
  composerAgent = 'build',
  onComposerAgentChange,
}: MessagePanelProps) {
  void onRefresh
  const hasInlineQuestion = messagesHaveOpenQuestionWithInput(messages)
  const blockComposerForQuestion =
    hasInlineQuestion || Boolean(pendingQuestion && pendingQuestion.sessionID === sessionId)

  const assistantIndices = messages
    .map((m, i) => (m.info.role === 'assistant' ? i : -1))
    .filter((i) => i >= 0)
  const hasRunningTool = messages.some((m, idx) => {
    if (m.info.role !== 'assistant') return false
    const assistantPos = assistantIndices.indexOf(idx)
    const hasLaterAssistant = assistantPos >= 0 && assistantPos < assistantIndices.length - 1
    return m.parts.some((p) => {
      if (p.type !== 'tool') return false
      const s = p.state?.status
      if (s !== 'running' && s !== 'pending') return false
      // Stale pending once a newer assistant message exists — hide abort affordance
      return !hasLaterAssistant
    })
  })

  const staleToolCallIdsRef = useRef<Set<string> | null>(null)
  const staleToolCallIds = useMemo(() => {
    const next = collectStaleToolCallIDs(messages)
    // Keep the Set instance stable when its contents are unchanged, so memoized
    // bubbles don't re-render on every transcript refresh.
    const prev = staleToolCallIdsRef.current
    if (prev && prev.size === next.size) {
      let same = true
      for (const v of next) {
        if (!prev.has(v)) {
          same = false
          break
        }
      }
      if (same) return prev
    }
    staleToolCallIdsRef.current = next
    return next
  }, [messages])

  // Session-wide stats shown under the composer (deepseek-harness style).
  const summary = useMemo(() => buildSessionSummary(messages), [messages])
  // Stable wall clock for anchor keys — refreshed on a slow tick instead of every render.
  const [transcriptAnchorNowMs, setTranscriptAnchorNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setTranscriptAnchorNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  /** Whether the message list is scrolled to the very bottom (controls the floating button). */
  const [atBottom, setAtBottom] = useState(true)
  const scrollTargetRef = useRef<HTMLDivElement | null>(null)

  const handleScroll = () => {
    const el = messageListScrollRef?.current ?? scrollTargetRef.current
    if (!el) return
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    setAtBottom(dist <= 24)
  }

  const scrollToBottom = () => {
    const el = messageListScrollRef?.current ?? scrollTargetRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  const listRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () =>
      messageListScrollRef?.current ?? scrollTargetRef.current ?? listRef.current,
    estimateSize: () => 96,
    overscan: 12,
  })

  // Expose a scroll-to-index function so parents (subtask selection) can move
  // the virtualized list to a specific message even if it isn't mounted yet.
  useEffect(() => {
    if (!messageScrollToIndexRef) return
    messageScrollToIndexRef.current = (index: number) => {
      // Defer past the current render/lifecycle so react-virtual's internal
      // flushSync isn't triggered from inside a lifecycle method.
      window.setTimeout(() => {
        virtualizer.scrollToIndex(index, { align: 'center', behavior: 'auto' })
      }, 0)
    }
    return () => {
      if (messageScrollToIndexRef) messageScrollToIndexRef.current = null
    }
  }, [messageScrollToIndexRef, virtualizer])

  /** Keep the floating button hidden when new messages arrive and we are already at the bottom. */
  useEffect(() => {
    if (loading) return
    const el = messageListScrollRef?.current ?? scrollTargetRef.current
    if (!el) return
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    setAtBottom(dist <= 24)
  }, [messages, loading, messageListScrollRef])

  /** Auto-scroll to the bottom when entering a session (avoids starting at the top). */
  const prevSessionIdRef = useRef(sessionId)
  const pendingAutoScrollRef = useRef(false)
  useEffect(() => {
    if (prevSessionIdRef.current === sessionId) return
    prevSessionIdRef.current = sessionId
    pendingAutoScrollRef.current = true
  }, [sessionId])

  useEffect(() => {
    if (!pendingAutoScrollRef.current) return
    if (loading) return
    pendingAutoScrollRef.current = false
    const root = messageListScrollRef?.current
    if (!root) return
    const frame = requestAnimationFrame(() => {
      root.scrollTop = root.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [messages, loading, messageListScrollRef])

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--color-bg-white)',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 48,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--color-border-light)',
          background: 'var(--color-bg-white)',
          flexShrink: 0,
        }}
      >
        <EditableSessionTitle
          sessionId={sessionId}
          title={sessionTitle}
          loading={loading}
          onCommit={onSessionTitleCommit}
        />
      </div>

      {waitingForAssistantReply && !loading && (
        <div
          style={{
            flexShrink: 0,
            padding: '8px 16px',
            fontSize: 12,
            color: 'var(--color-accent-strong)',
            background:
              'linear-gradient(90deg, var(--color-link-soft) 0%, var(--color-link-softer) 100%)',
            borderBottom: '1px solid var(--color-link-soft)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--color-accent-strong)',
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 600 }}>Waiting for the model…</span>
          <span style={{ color: 'var(--color-tip-muted)', fontWeight: 400 }}>
            Polling in the background — if nothing appears, check OpenCode logs or upstream queue
            delays.
          </span>
        </div>
      )}

      {/* Messages (scrollable) */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          ref={(node) => {
            listRef.current = node
            scrollTargetRef.current = node
            if (messageListScrollRef) messageListScrollRef.current = node
          }}
          onScroll={handleScroll}
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '0',
            overflowWrap: 'break-word',
          }}
        >
          {loading ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '32px',
                color: 'var(--color-text-tertiary)',
                fontSize: 12,
              }}
            >
              Loading…
            </div>
          ) : messages.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--color-text-tertiary)',
                fontSize: 12,
              }}
            >
              Pick a session to start chatting
            </div>
          ) : (
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: virtualizer.getTotalSize(),
                flexShrink: 0,
              }}
            >
              {virtualizer.getVirtualItems().map((vi) => {
                const idx = vi.index
                const msg = messages[idx]
                if (!msg) return null
                const hl = highlightMessageIndices?.has(idx) ?? false
                return (
                  <div
                    key={msg.info.id || `msg-${idx}`}
                    data-message-index={idx}
                    data-virtual-index={vi.index}
                    ref={(el) => {
                      if (el) virtualizer.measureElement(el)
                    }}
                    data-index={vi.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vi.start}px)`,
                      borderRadius: 10,
                      padding: hl ? '6px 8px' : '2px 0',
                      margin: hl ? '2px -4px' : 0,
                      outline: hl ? `2px solid ${actionFlowPalette.completed.stroke}` : 'none',
                      outlineOffset: hl ? 1 : 0,
                      background: hl ? 'rgba(245, 255, 234, 0.55)' : 'transparent',
                      boxShadow: hl ? `0 0 0 1px rgba(145, 163, 123, 0.25)` : 'none',
                      transition: 'background 0.15s ease, outline 0.15s ease',
                    }}
                  >
                    <MessageBubble
                      message={msg}
                      staleToolCallIds={staleToolCallIds}
                      transcriptAnchorNowMs={transcriptAnchorNowMs}
                      isLastInTurn={isLastMessageInTurn(messages, idx)}
                      sessionDirectory={sessionDirectory}
                      ssePendingQuestion={
                        pendingQuestion && pendingQuestion.sessionID === sessionId
                          ? pendingQuestion
                          : null
                      }
                      onQuestionAnswered={onQuestionAnswered}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Floating "scroll to latest" button — pinned above the composer, inside the message area */}
        {!atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            title="Scroll to the latest message"
            aria-label="Scroll to the latest message"
            style={{
              position: 'absolute',
              right: 24,
              bottom: 16,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-accent-deep)',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-md)',
              zIndex: 20,
              padding: 0,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14" />
              <path d="M19 12l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Todo snapshots + API fallback */}
      {(latestTodos.length > 0 || archivedTodos.length > 0) && (
        <div style={{ flexShrink: 0 }}>
          <TodoPanel
            latestActive={latestTodos}
            archivedCompleted={archivedTodos}
            latestTodowriteBatchProgress={latestTodowriteBatchProgress}
            highlightTodoIds={highlightTodoIds}
            todoPanelRevealGeneration={todoPanelRevealGeneration}
            onTodoClick={onTodoClick}
            listScrollRef={todoPanelScrollRef}
          />
        </div>
      )}

      {pendingQuestion &&
        pendingQuestion.sessionID === sessionId &&
        onQuestionReply &&
        !hasInlineQuestion && (
          <QuestionPromptPanel
            request={pendingQuestion}
            disabled={loading}
            submitting={questionSubmitting}
            onReply={onQuestionReply}
            onReject={onQuestionReject}
          />
        )}

      {/* Composer */}
      <div style={{ flexShrink: 0 }}>
        <MessageInput
          onSend={onSendMessage}
          disabled={!sessionId || loading || questionSubmitting || blockComposerForQuestion}
          onAbort={onAbortMessage}
          isRunning={hasRunningTool}
          aborting={aborting}
          sessionId={sessionId}
          composerModelRef={composerModelRef}
          onComposerModelRefChange={onComposerModelRefChange}
          composerModelOptions={composerModelOptions}
          composerModelsLoading={composerModelsLoading}
          composerModelsError={composerModelsError}
          envBootstrapModel={envBootstrapModel}
          composerAgent={composerAgent}
          onComposerAgentChange={onComposerAgentChange}
        />
        {summary && (
          <div
            style={{
              padding: '4px 16px 6px',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <MessageSummaryLine summary={summary} />
          </div>
        )}
      </div>
    </div>
  )
}

function isLastMessageInTurn(messages: OcMessage[], idx: number): boolean {
  const current = messages[idx]
  if (current.info.role === 'user') {
    return false
  }
  const next = messages[idx + 1]
  return !next || next.info.role === 'user'
}
