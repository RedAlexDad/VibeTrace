import { Fragment, type RefObject, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Tooltip } from 'react-tooltip'
import type { MappedAction, OcMessage } from '../types/opencode'
import type { AssistantSubtask } from '../utils/subtaskGrouping'
import type { ForkFromActionContext, ForkPanelSnapshotBundle } from '../utils/forkPanelSnapshot'
import SubtaskCard from './SubtaskCard'
import ActionTypeColorLegend from './ActionTypeColorLegend'
import {
  type ActionTypePaletteId,
  DEFAULT_ACTION_TYPE_PALETTE_ID,
  getActionTypeTriad,
} from '../styles/actionTypePalettes'
import { buildMappedActionsFromMessages, collectTaskChildDescriptors } from '../utils/actionMapping'
import { actionKey } from '../utils/actionKey'
import { getMessages } from '../services/opencodeApi'
import { usePrefersDark } from '../utils/usePrefersDark'
import {
  buildCompactMappedActionTooltipHtml,
  mergeMessagesForActionTooltipLookup,
} from '../utils/actionTooltipMapping'

/** Mirrors `formatDurationMs` in ActionFlowVisualization for summary tooltips */
function formatSummaryTooltipDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return '—'
  const sec = durationMs / 1000
  if (sec < 0.01) return '<0.01s'
  return `${sec.toFixed(2)}s`
}

/** Estimated height for a not-yet-mounted card while windowing (placeholder sizing). */
const CARD_ESTIMATED_HEIGHT = 320
/** Extra cards rendered above/below the visible window to avoid blank gaps while scrolling. */
const CARD_OVERSCAN = 2

interface CardWindow {
  start: number
  end: number
  topSpacer: number
  bottomSpacer: number
}

/** Compute which cards to mount + spacer heights given scrollTop and measured card heights. */
function computeCardWindow(
  scrollTop: number,
  viewportH: number,
  count: number,
  heights: number[],
  forceIndex?: number | null,
): CardWindow {
  if (count === 0) return { start: 0, end: -1, topSpacer: 0, bottomSpacer: 0 }
  // running prefix sums
  let acc = 0
  const topByIndex = heights.map((h) => {
    const at = acc
    acc += h
    return at
  })
  const totalH = acc

  const viewTop = Math.max(0, scrollTop - CARD_OVERSCAN * CARD_ESTIMATED_HEIGHT)
  const viewBottom = scrollTop + viewportH + CARD_OVERSCAN * CARD_ESTIMATED_HEIGHT

  let start = 0
  let end = count - 1
  for (let i = 0; i < count; i++) {
    if (topByIndex[i] + heights[i] > viewTop) {
      start = i
      break
    }
  }
  for (let i = start; i < count; i++) {
    if (topByIndex[i] <= viewBottom) end = i
    else break
  }

  // Ensure the linked card is mounted so connector scrollIntoView can find it.
  if (forceIndex != null && forceIndex >= 0 && forceIndex < count) {
    start = Math.min(start, forceIndex)
    end = Math.max(end, forceIndex)
  }

  const topSpacer = topByIndex[start] ?? 0
  const bottomSpacer = Math.max(0, totalH - (topByIndex[end] ?? 0) - heights[end])
  return { start, end, topSpacer, bottomSpacer }
}

interface SubtaskDebugPanelProps {
  messages: OcMessage[]
  visibleSubtasks: Array<{ subtask: AssistantSubtask; sourceIndex: number }>
  linkedSubtaskIndex: number | null
  onSelectSubtask: (index: number) => void
  onForkFromAction?: (action: MappedAction & { row: number }, ctx: ForkFromActionContext) => void
  onAnalyzeFromAction?: (action: MappedAction & { row: number }) => void
  listScrollRef?: RefObject<HTMLDivElement | null>
  sessionDirectory?: string
  /** Saved fork-before snapshot for the forked session (local). */
  forkPanelSnapshotBundle?: ForkPanelSnapshotBundle | null
  /** Links selection from ActionFlow rects. */
  selection?: { subtaskIndex: number; actionKey: string } | null
  /** ActionFlow rect click → action-level selection. */
  onSelectAction?: (subtaskIndex: number, actionKey: string | null) => void
  /** Layout mode toggled by the subtask panel header. */
  flowLayoutMode?: 'timeline' | 'summary'
}

export default function SubtaskDebugPanel({
  messages,
  visibleSubtasks,
  linkedSubtaskIndex,
  onSelectSubtask,
  onForkFromAction,
  onAnalyzeFromAction,
  listScrollRef,
  sessionDirectory,
  forkPanelSnapshotBundle = null,
  selection = null,
  onSelectAction,
  flowLayoutMode = 'timeline',
}: SubtaskDebugPanelProps) {
  usePrefersDark()
  const summaryTooltipSafeId = useId().replace(/:/g, '')
  const summaryTooltipId = `subtask-summary-tip-${summaryTooltipSafeId}`
  const [tooltipMounted, setTooltipMounted] = useState(false)
  const [colorBy, setColorBy] = useState<'tokens' | 'type'>('type')
  const actionTypePaletteId: ActionTypePaletteId = DEFAULT_ACTION_TYPE_PALETTE_ID
  const [childSessionMessages, setChildSessionMessages] = useState<Record<string, OcMessage[]>>({})
  const summaryViewportRef = useRef<HTMLDivElement | null>(null)
  const [summaryViewportSize, setSummaryViewportSize] = useState({ width: 0, height: 0 })
  /** Virtualized card window state (timeline mode only). */
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)
  const cardHeightsRef = useRef<number[]>([])
  const timelineListRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setTooltipMounted(true)
  }, [])

  const summarySegments = useMemo(
    () =>
      visibleSubtasks.map(({ subtask, sourceIndex }, rowIndex) => {
        const indices = [
          ...(subtask.userMessageIndices ?? []),
          ...subtask.assistantMessageIndices,
        ].sort((a, b) => a - b)
        const segmentMessages = indices
          .map((i) => messages[i])
          .filter((m): m is OcMessage => m != null)
        const parentActions = buildMappedActionsFromMessages(segmentMessages)
        const childDescriptors = collectTaskChildDescriptors(segmentMessages)
        return {
          sourceIndex,
          rowIndex,
          subtaskId: subtask.subtask_id,
          parentActions,
          childDescriptors,
          segmentMessages,
        }
      }),
    [visibleSubtasks, messages],
  )

  useEffect(() => {
    if (flowLayoutMode !== 'summary') return
    const ids = Array.from(
      new Set(summarySegments.flatMap((seg) => seg.childDescriptors.map((d) => d.childSessionID))),
    )
    if (ids.length === 0) return
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (sid) => {
          try {
            const msgs = await getMessages(
              sid,
              `summary child session ${sid.slice(0, 8)}`,
              sessionDirectory,
            )
            return [sid, msgs] as const
          } catch {
            return [sid, [] as OcMessage[]] as const
          }
        }),
      )
      if (cancelled) return
      setChildSessionMessages((prev) => {
        const next = { ...prev }
        for (const [sid, msgs] of entries) next[sid] = msgs
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [summarySegments, flowLayoutMode, sessionDirectory])

  useEffect(() => {
    if (flowLayoutMode !== 'summary') return
    const el = summaryViewportRef.current
    if (!el) return
    const update = () => {
      setSummaryViewportSize({ width: el.clientWidth, height: el.clientHeight })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [flowLayoutMode])

  /** Track the timeline list container size + scroll for windowed card rendering. */
  useEffect(() => {
    if (flowLayoutMode === 'summary') return
    const el = timelineListRef.current ?? listScrollRef?.current
    if (!el) return
    const update = () => setViewportHeight(el.clientHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [flowLayoutMode, listScrollRef])

  /** Reset cached heights when the subtask set changes (keys shift). */
  useEffect(() => {
    cardHeightsRef.current = []
    setScrollTop(0)
  }, [visibleSubtasks, flowLayoutMode])

  const cardWindow = useMemo(() => {
    if (flowLayoutMode === 'summary') return { start: 0, end: -1, topSpacer: 0, bottomSpacer: 0 }
    const heights = visibleSubtasks.map((_, i) => cardHeightsRef.current[i] ?? CARD_ESTIMATED_HEIGHT)
    return computeCardWindow(
      scrollTop,
      viewportHeight,
      visibleSubtasks.length,
      heights,
      linkedSubtaskIndex,
    )
  }, [scrollTop, viewportHeight, visibleSubtasks, flowLayoutMode, linkedSubtaskIndex])

  const handleCardHeight = (index: number, height: number) => {
    if (cardHeightsRef.current[index] === height) return
    cardHeightsRef.current = [...cardHeightsRef.current]
    cardHeightsRef.current[index] = height
  }

  const summaryRows = summarySegments.map(
    ({ sourceIndex, rowIndex, subtaskId, parentActions, childDescriptors, segmentMessages }) => {
      const childActions = childDescriptors.flatMap((desc) => {
        const msgs = childSessionMessages[desc.childSessionID] ?? []
        return buildMappedActionsFromMessages(msgs).map((a, i) => ({
          ...a,
          /** Place after parent task for readable ordering within the subtask. */
          sortTime: desc.anchorSortTime + 0.0005 + i * 0.0000001,
        }))
      })
      const actions = [...parentActions, ...childActions].sort((a, b) => a.sortTime - b.sortTime)
      return {
        sourceIndex,
        rowIndex,
        actions,
        subtaskId,
        sequenceSignature: actions.map((a) => a.actionType),
        segmentMessages,
        childDescriptors,
      }
    },
  )
  /**
   * Lexicographic sort by action-type sequence (no section headers).
   * Rows whose timeline starts with UserRequest are placed first so “user turn → …”
   * groups sit at the top; then group by first differing action type, then length / rowIndex.
   */
  const summaryRowsSorted = [...summaryRows].sort((a, b) => {
    const startsUr = (sig: string[]) => sig[0] === 'UserRequest'
    const pri = (sig: string[]) => (startsUr(sig) ? 0 : 1)
    const cmpPri = pri(a.sequenceSignature) - pri(b.sequenceSignature)
    if (cmpPri !== 0) return cmpPri

    const n = Math.min(a.sequenceSignature.length, b.sequenceSignature.length)
    for (let i = 0; i < n; i++) {
      const cmp = a.sequenceSignature[i]!.localeCompare(b.sequenceSignature[i]!, 'en')
      if (cmp !== 0) return cmp
    }
    if (a.sequenceSignature.length !== b.sequenceSignature.length) {
      return a.sequenceSignature.length - b.sequenceSignature.length
    }
    return a.rowIndex - b.rowIndex
  })
  const summaryLayout = useMemo(() => {
    const DEFAULT_BLOCK_W = 28
    const DEFAULT_BLOCK_H = 36
    const rowCount = Math.max(1, summaryRowsSorted.length)
    const maxActionCount = Math.max(1, ...summaryRowsSorted.map((r) => r.actions.length))
    const availableW = Math.max(1, summaryViewportSize.width)
    const availableH = Math.max(1, summaryViewportSize.height)
    const blockWidth = Math.max(
      2,
      Math.floor(Math.min(DEFAULT_BLOCK_W, availableW / maxActionCount)),
    )
    const blockHeight = Math.max(2, Math.floor(Math.min(DEFAULT_BLOCK_H, availableH / rowCount)))
    return { blockWidth, blockHeight }
  }, [summaryRowsSorted, summaryViewportSize.width, summaryViewportSize.height])

  const summaryPanel = (
    <>
      <div
        ref={summaryViewportRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          padding: 0,
          border: 'none',
          borderRadius: 0,
          background: 'transparent',
        }}
      >
        {summaryRowsSorted.length === 0 ? (
          <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>No subtasks</span>
        ) : (
          summaryRowsSorted.map((row) => {
            const tooltipMessages = mergeMessagesForActionTooltipLookup(
              row.segmentMessages,
              row.childDescriptors.flatMap((d) => childSessionMessages[d.childSessionID] ?? []),
            )
            return (
              <div key={`${row.subtaskId}:${row.sourceIndex}:${row.rowIndex}`}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0,
                    margin: 0,
                    height: summaryLayout.blockHeight,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0,
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      height: summaryLayout.blockHeight,
                      flex: 1,
                      minWidth: 0,
                      padding: 0,
                    }}
                  >
                    {row.actions.length === 0 ? (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>
                        No actions
                      </span>
                    ) : (
                      row.actions.map((action) => {
                        const paletteTriad = getActionTypeTriad(
                          actionTypePaletteId,
                          action.actionType,
                        )
                        const tipHtml = buildCompactMappedActionTooltipHtml(
                          action,
                          tooltipMessages,
                          formatSummaryTooltipDuration,
                        )
                        return (
                          <span
                            key={actionKey(action)}
                            data-tooltip-id={summaryTooltipId}
                            data-tooltip-html={tipHtml}
                            data-tooltip-place="top"
                            style={{
                              width: summaryLayout.blockWidth,
                              height: summaryLayout.blockHeight,
                              borderRadius: 0,
                              flexShrink: 0,
                              background:
                                action.actionType === 'UserRequest'
                                  ? 'var(--color-text-tertiary)'
                                  : paletteTriad.fill,
                              border: 'none',
                            }}
                          />
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
      {tooltipMounted && (
        <Tooltip
          id={summaryTooltipId}
          anchorSelect={`[data-tooltip-id="${summaryTooltipId}"]`}
          className="action-flow-react-tooltip"
          variant="light"
          positionStrategy="fixed"
          delayShow={150}
          delayHide={220}
          opacity={1}
          clickable
          globalCloseEvents={{ scroll: false, resize: true, escape: true }}
          arrowColor="var(--color-tip-bg)"
        />
      )}
    </>
  )

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: '0 0 8px',
          borderBottom: '1px solid var(--color-border-light)',
          marginBottom: 8,
        }}
      >
        <ActionTypeColorLegend paletteId={actionTypePaletteId} />
      </div>
      <div
        ref={(node) => {
          timelineListRef.current = node
          if (listScrollRef) listScrollRef.current = node
        }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        style={{
          flex: 1,
          overflowY: flowLayoutMode === 'summary' ? 'hidden' : 'auto',
          fontSize: 11,
          color: 'var(--color-text-primary)',
          lineHeight: 1.45,
        }}
      >
        {flowLayoutMode === 'summary' ? (
          summaryPanel
        ) : visibleSubtasks.length === 0 ? (
          <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>No subtasks</span>
        ) : (
          <>
            {cardWindow.topSpacer > 0 && (
              <div style={{ height: cardWindow.topSpacer, flexShrink: 0 }} aria-hidden />
            )}
            {visibleSubtasks
              .slice(cardWindow.start, cardWindow.end + 1)
              .map(({ subtask: st, sourceIndex }, sliceIdx) => {
                const si = cardWindow.start + sliceIdx
                return (
                  <Fragment
                    key={`${st.subtask_id}:${sourceIndex}:${st.assistantMessageIndices[0] ?? -1}:${st.assistantMessageIndices[st.assistantMessageIndices.length - 1] ?? -1}:${st.assistantMessageIndices.length}`}
                  >
                    <HeightProbe index={si} onHeight={handleCardHeight}>
                      <SubtaskCard
                        subtask={st}
                        messages={messages}
                        displayIndex={si}
                        cardIndex={sourceIndex}
                        isLinked={linkedSubtaskIndex === sourceIndex}
                        onSelectSubtask={() => onSelectSubtask(sourceIndex)}
                        onForkFromAction={onForkFromAction}
                        onAnalyzeFromAction={onAnalyzeFromAction}
                        sessionDirectory={sessionDirectory}
                        forkPanelSnapshotBundle={forkPanelSnapshotBundle}
                        selectedActionKey={
                          selection && selection.subtaskIndex === sourceIndex
                            ? selection.actionKey
                            : null
                        }
                        otherSubtaskHasSelection={false}
                        onSelectActionFromFlow={
                          onSelectAction
                            ? (key) => onSelectAction(sourceIndex, key)
                            : undefined
                        }
                        colorBy={colorBy}
                        onColorByChange={setColorBy}
                        actionTypePaletteId={actionTypePaletteId}
                      />
                    </HeightProbe>
                  </Fragment>
                )
              })}
            {cardWindow.bottomSpacer > 0 && (
              <div style={{ height: cardWindow.bottomSpacer, flexShrink: 0 }} aria-hidden />
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Measures a mounted card's height and reports it back to the windowing logic. */
function HeightProbe({
  index,
  onHeight,
  children,
}: {
  index: number
  onHeight: (index: number, height: number) => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const h = el.getBoundingClientRect().height
      onHeight(index, Math.round(h))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [index, onHeight])
  return <div ref={ref}>{children}</div>
}
