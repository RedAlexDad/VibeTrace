import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { MappedAction, OcMessage } from '@/shared/types/opencode'
import {
  buildSubtaskCardMetrics,
  formatDurationMs,
  formatSubtaskCostDisplay,
} from '@/entities/subtask/lib/subtaskMetrics'
import {
  applyParallelLayoutFromCalls,
  buildMappedActionsFromMessages,
} from '@/entities/action/lib/actionMapping'
import { mergeMessagesForActionTooltipLookup } from '@/entities/action/lib/actionTooltipMapping'
import ActionFlowVisualization from '@/widgets/action-flow/ui/ActionFlowVisualization'
import MetricBox from './MetricBox'
import useChildBranches from './useChildBranches'
import useFilter from './useFilter'
import { buildForkMergedFlow } from './forkMerge'
import { CARD_MIN_HEIGHT, LONG_RUNNING_MS, fontSans, type SubtaskCardProps } from './types'

export default function SubtaskCard({
  subtask,
  messages,
  displayIndex,
  cardIndex,
  isLinked = false,
  onSelectSubtask,
  onForkFromAction,
  onAnalyzeFromAction,
  sessionDirectory,
  forkPanelSnapshotBundle = null,
  selectedActionType = null,
  selectedActionKey = null,
  otherSubtaskHasSelection = false,
  onSelectActionFromFlow,
  colorBy,
  onColorByChange,
  actionTypePaletteId,
}: SubtaskCardProps) {
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [actionsDurationOn, setActionsDurationOn] = useState(false)
  const [filterMode, setFilterMode] = useState<'duration' | 'tokens'>('duration')
  /** DOM anchor only — use outer wrapper for fork/scroll */
  const cardRef = useRef<HTMLDivElement | null>(null)

  /** Leading user indices + assistants in global timeline order */
  const segmentMessages = useMemo((): OcMessage[] => {
    const indices = [
      ...(subtask.userMessageIndices ?? []),
      ...subtask.assistantMessageIndices,
    ].sort((a, b) => a - b)
    return indices.map((i) => messages[i]).filter((msg): msg is OcMessage => msg != null)
  }, [subtask.userMessageIndices, subtask.assistantMessageIndices, messages])

  const parentFlowActions = useMemo(
    () => buildMappedActionsFromMessages(segmentMessages, { nowMs: nowTick }),
    [segmentMessages, nowTick],
  )

  const { childBranchActions, childBranchMessages, parallelByCallId } = useChildBranches({
    segmentMessages,
    sessionDirectory,
    nowMs: nowTick,
  })

  const m = useMemo(
    () =>
      buildSubtaskCardMetrics(subtask, messages, displayIndex, {
        nowMs: nowTick,
        additionalMessages: childBranchMessages,
      }),
    [subtask, messages, displayIndex, nowTick, childBranchMessages],
  )

  const flowActions = useMemo(() => {
    const merged = [...parentFlowActions, ...childBranchActions].sort(
      (a, b) => a.sortTime - b.sortTime,
    )
    return applyParallelLayoutFromCalls(merged, parallelByCallId)
  }, [parentFlowActions, childBranchActions, parallelByCallId])

  const subtaskSig = useMemo(() => {
    const ids = subtask.assistantMessageIndices
    const first = ids[0] ?? -1
    const last = ids[ids.length - 1] ?? -1
    return `${subtask.subtask_id}:${first}:${last}:${ids.length}`
  }, [subtask.subtask_id, subtask.assistantMessageIndices])

  const filter = useFilter({ flowActions, subtaskSig, filterMode })

  /** Matches `mergeMessagesForActionTooltipLookup`: parent segment + fetched child rows */
  const tooltipLookupMessages = useMemo(
    () => mergeMessagesForActionTooltipLookup(segmentMessages, childBranchMessages),
    [segmentMessages, childBranchMessages],
  )

  const forkMergedFlow = useMemo(
    () =>
      buildForkMergedFlow({
        forkPanelSnapshotBundle,
        subtaskId: subtask.subtask_id,
        displayIndex,
        flowActions,
        tooltipLookupMessages,
      }),
    [forkPanelSnapshotBundle, subtask.subtask_id, displayIndex, flowActions, tooltipLookupMessages],
  )
  const hasActiveRunningAction = useMemo(
    () => flowActions.some((a) => a.status === 'running' || a.status === 'pending'),
    [flowActions],
  )
  const hasLongRunningAction = useMemo(
    () =>
      flowActions.some(
        (a) =>
          (a.status === 'running' || a.status === 'pending') && a.durationMs >= LONG_RUNNING_MS,
      ),
    [flowActions],
  )

  useEffect(() => {
    if (!hasActiveRunningAction) return
    /**
     * Heartbeat bumps `nowTick` so live durations of running actions keep ticking.
     * 5s keeps the "live duration" feel while avoiding a full D3 rebuild of every
     * card every couple of seconds (the SVG re-render was the main CPU cost).
     */
    const id = window.setInterval(() => setNowTick(Date.now()), 5000)
    return () => window.clearInterval(id)
  }, [hasActiveRunningAction])

  const durationLabel = formatDurationMs(m.durationMs)
  const changesLabel = String(m.mutatedFileCount)
  /** Hide the golden end capsule while tools are active so tasks don’t look “done” prematurely */
  const showFlowEndNode = !hasActiveRunningAction && flowActions.length > 0

  /**
   * Stabilize `flowEndSummary` identity — inline object literals each render fooled ActionFlowVisualization’s first
   * `useLayoutEffect` into `selectAll('*').remove()`, wiping the SVG whenever clicks/`nowTick` fired.
   */
  const flowEndSummary = useMemo(
    () => ({
      readFileTotalCount: m.readFilesCount,
      readFilePaths: m.readFilePaths,
      globMatchFileCount: m.globMatchFileCount,
      webSearchCount: m.webSearchCallCount,
      webSearchQueries: m.webSearchQueries,
      writeFileCount: m.mutatedFileCount,
      changedFilePaths: m.mutatedFilePaths,
    }),
    [
      m.readFilesCount,
      m.readFilePaths,
      m.globMatchFileCount,
      m.webSearchCallCount,
      m.webSearchQueries,
      m.mutatedFileCount,
      m.mutatedFilePaths,
    ],
  )

  /** Same memo trick for fork handler identity */
  const handleForkFromActionWrapped = useMemo(() => {
    if (!onForkFromAction) return undefined
    return (act: MappedAction & { row: number }) =>
      onForkFromAction(act, {
        subtaskId: subtask.subtask_id,
        subtaskDisplayIndex: displayIndex,
        assistantMessageIndices: subtask.assistantMessageIndices,
      })
  }, [onForkFromAction, subtask.subtask_id, subtask.assistantMessageIndices, displayIndex])

  const bodyContent = (
    <>
      <h3
        style={{
          margin: 0,
          fontWeight: 600,
          fontSize: 13,
          lineHeight: '18px',
          color: 'var(--color-control-track-on)',
          flexShrink: 0,
        }}
      >
        {m.title}
      </h3>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'nowrap',
          gap: 10,
          width: '100%',
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'nowrap',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 400,
                lineHeight: '14px',
                color: 'var(--color-control-track-on)',
              }}
            >
              Actions duration
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={actionsDurationOn}
              onClick={() => setActionsDurationOn((v) => !v)}
              style={{
                width: 26,
                height: 13,
                borderRadius: 80,
                background: actionsDurationOn
                  ? 'var(--color-control-track-on)'
                  : 'var(--color-control-track-off)',
                border: 'none',
                padding: 2,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: actionsDurationOn ? 'flex-end' : 'flex-start',
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: 'var(--color-bg-white)',
                  display: 'block',
                  flexShrink: 0,
                }}
              />
            </button>
          </div>
          <div
            style={{
              width: 1,
              height: 14,
              background: 'var(--color-border)',
              flexShrink: 0,
            }}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 400,
                lineHeight: '14px',
                color: 'var(--color-control-track-on)',
              }}
            >
              Actions color
            </span>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={() => onColorByChange('tokens')}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: fontSans,
                  fontSize: 11,
                  lineHeight: '16px',
                  color:
                    colorBy === 'tokens'
                      ? 'var(--color-control-track-on)'
                      : 'var(--color-control-muted)',
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    boxSizing: 'border-box',
                    background: colorBy === 'tokens' ? 'var(--color-control-muted)' : 'transparent',
                    border:
                      colorBy === 'tokens'
                        ? '1px solid var(--color-control-track-off)'
                        : '1px solid var(--color-control-muted)',
                  }}
                />
                tokens
              </button>
              <button
                type="button"
                onClick={() => onColorByChange('type')}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: fontSans,
                  fontSize: 11,
                  lineHeight: '16px',
                  color:
                    colorBy === 'type'
                      ? 'var(--color-control-track-on)'
                      : 'var(--color-control-muted)',
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    boxSizing: 'border-box',
                    background: colorBy === 'type' ? 'var(--color-control-muted)' : 'transparent',
                    border:
                      colorBy === 'type'
                        ? '1px solid var(--color-control-track-off)'
                        : '1px solid var(--color-control-muted)',
                  }}
                />
                type
              </button>
            </div>
          </div>
        </div>

        {filter.activeFilterDomain && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              minWidth: 0,
              flexWrap: 'nowrap',
              flex: '1 1 auto',
              marginLeft: 'auto',
            }}
          >
            <div
              style={{
                width: 1,
                height: 14,
                background: 'var(--color-border)',
                flexShrink: 0,
                marginRight: 2,
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 400,
                lineHeight: '14px',
                color: 'var(--color-control-track-on)',
                flexShrink: 0,
              }}
            >
              Filter
            </span>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <button
                type="button"
                onClick={() => setFilterMode('duration')}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: fontSans,
                  fontSize: 10,
                  lineHeight: '14px',
                  color:
                    filterMode === 'duration'
                      ? 'var(--color-control-track-on)'
                      : 'var(--color-control-muted)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    boxSizing: 'border-box',
                    background:
                      filterMode === 'duration' ? 'var(--color-control-muted)' : 'transparent',
                    border:
                      filterMode === 'duration'
                        ? '1px solid var(--color-control-track-off)'
                        : '1px solid var(--color-control-muted)',
                  }}
                />
                duration
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('tokens')}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: fontSans,
                  fontSize: 10,
                  lineHeight: '14px',
                  color:
                    filterMode === 'tokens'
                      ? 'var(--color-control-track-on)'
                      : 'var(--color-control-muted)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    boxSizing: 'border-box',
                    background:
                      filterMode === 'tokens' ? 'var(--color-control-muted)' : 'transparent',
                    border:
                      filterMode === 'tokens'
                        ? '1px solid var(--color-control-track-off)'
                        : '1px solid var(--color-control-muted)',
                  }}
                />
                tokens
              </button>
            </div>
            <input
              className="subtask-card-duration-filter-range"
              type="range"
              min={filter.activeFilterDomain.min}
              max={filter.activeFilterDomain.max}
              step={filter.activeFilterStep}
              value={filter.activeFilterValue}
              onChange={(e) => filter.setHighlightMin(Number(e.target.value))}
              title={
                filterMode === 'duration'
                  ? 'Time filter — minimum duration to highlight'
                  : 'Token filter — minimum tokens to highlight'
              }
              aria-label={
                filterMode === 'duration'
                  ? 'Time filter: minimum duration to highlight'
                  : 'Token filter: minimum tokens to highlight'
              }
              style={{
                minWidth: 56,
                flex: '1 1 96px',
                maxWidth: 140,
                height: 14,
                verticalAlign: 'middle',
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                lineHeight: '14px',
                color: 'var(--color-text-secondary)',
                whiteSpace: 'nowrap',
                flexShrink: 1,
                minWidth: 0,
              }}
            >
              {filter.activeFilterMaxLabel}·{filter.matchedActionCount}/{flowActions.length}
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          flex: '0 0 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {(() => {
          /**
           * Fork compare mode feeds ghost rows + forked branch through one ActionFlowVisualization; otherwise render
           * plain `flowActions` for the live session.
           */
          const useForkMerged = forkMergedFlow != null
          const renderActions = useForkMerged ? forkMergedFlow!.merged : flowActions
          const renderTooltips = useForkMerged
            ? forkMergedFlow!.mergedTooltips
            : tooltipLookupMessages
          const forkAnchor = useForkMerged ? forkMergedFlow!.anchorActionKey : null
          return (
            <ActionFlowVisualization
              actions={renderActions}
              durationMode={actionsDurationOn}
              colorMode={colorBy}
              actionTypePaletteId={actionTypePaletteId}
              durationHighlightMinMs={filter.durationHighlightForFlow}
              tokenHighlightMin={filter.tokenHighlightForFlow}
              tooltipMessages={renderTooltips}
              highlightedActionType={selectedActionType}
              highlightedActionKey={selectedActionKey}
              dimAll={otherSubtaskHasSelection}
              onSelectAction={onSelectActionFromFlow}
              forkAnchorActionKey={forkAnchor}
              onForkFromAction={handleForkFromActionWrapped}
              onAnalyzeFromAction={onAnalyzeFromAction}
              showFlowEndNode={showFlowEndNode}
              flowEndSummary={flowEndSummary}
            />
          )
        })()}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'stretch',
          gap: 6,
          width: '100%',
          flexShrink: 0,
        }}
      >
        <MetricBox label="LLM calls" value={String(m.llmCallCount)} />
        <MetricBox label="Changes" value={changesLabel} />
        <MetricBox label="Time" value={durationLabel} alert={hasLongRunningAction} />
        <MetricBox label="Total Tokens" value={String(m.tokensSegmentSum)} />
        <MetricBox label="Cost" value={formatSubtaskCostDisplay(m)} />
      </div>
    </>
  )

  const cardInnerStyle: CSSProperties = {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    minHeight: CARD_MIN_HEIGHT,
    height: 'auto',
    flexShrink: 0,
    padding: '12px 14px',
    gap: 4,
    width: '100%',
    minWidth: 0,
    background: isLinked ? 'var(--color-bg-white)' : 'var(--color-bg-white)',
    borderRadius: 14,
    fontFamily: fontSans,
    overflow: 'visible',
    cursor: onSelectSubtask ? 'pointer' : 'default',
    transition: 'box-shadow 0.15s ease, border-color 0.15s ease, background-color 0.15s ease',
    border: hasLongRunningAction
      ? isLinked
        ? '2px solid var(--color-error-text)'
        : '1px solid var(--color-error-text)'
      : isLinked
        ? '2px solid var(--color-link)'
        : '1px solid var(--color-border)',
    boxShadow: isLinked
      ? `0 0 0 3px rgba(90, 143, 255, 0.22), 0 6px 18px rgba(90, 143, 255, 0.12)`
      : 'none',
  }

  return (
    <div
      ref={cardRef}
      data-subtask-card-index={cardIndex ?? displayIndex}
      onClick={() => onSelectSubtask?.()}
      style={{ ...cardInnerStyle, marginBottom: 8 }}
    >
      {bodyContent}
    </div>
  )
}
