import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { ActionTypePaletteId } from '@/shared/styles/actionTypePalettes'
import { DEFAULT_ACTION_TYPE_PALETTE_ID } from '@/shared/styles/actionTypePalettes'
import SubtaskCard from '@/widgets/vibetrace-panel/ui/SubtaskCard'
import ActionTypeColorLegend from '@/widgets/action-flow/ui/ActionTypeColorLegend'
import { usePrefersDark } from '@/shared/lib/hooks/usePrefersDark'
import SummaryView from './SummaryView'
import HeightProbe from './HeightProbe'
import { computeCardWindow, CARD_ESTIMATED_HEIGHT } from './windowing'
import type { SubtaskDebugPanelProps } from './types'

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
  const [colorBy, setColorBy] = useState<'tokens' | 'type'>('type')
  const actionTypePaletteId: ActionTypePaletteId = DEFAULT_ACTION_TYPE_PALETTE_ID
  /** Virtualized card window state (timeline mode only). */
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)
  const cardHeightsRef = useRef<number[]>([])
  const timelineListRef = useRef<HTMLDivElement | null>(null)

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
          <SummaryView
            messages={messages}
            visibleSubtasks={visibleSubtasks}
            sessionDirectory={sessionDirectory}
            actionTypePaletteId={actionTypePaletteId}
          />
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