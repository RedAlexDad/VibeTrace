import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Tooltip } from 'react-tooltip'
import type { OcMessage } from '@/shared/types/opencode'
import type { AssistantSubtask } from '@/entities/subtask/lib/subtaskGrouping'
import { type ActionTypePaletteId, getActionTypeTriad } from '@/shared/styles/actionTypePalettes'
import {
  buildMappedActionsFromMessages,
  collectTaskChildDescriptors,
} from '@/entities/action/lib/actionMapping'
import { actionKey } from '@/entities/action/lib/actionKey'
import { getMessages } from '@/shared/api/opencodeApi'
import {
  buildCompactMappedActionTooltipHtml,
  mergeMessagesForActionTooltipLookup,
} from '@/entities/action/lib/actionTooltipMapping'
import formatSummaryTooltipDuration from './formatSummaryTooltipDuration'

interface SummaryViewProps {
  messages: OcMessage[]
  visibleSubtasks: Array<{ subtask: AssistantSubtask; sourceIndex: number }>
  sessionDirectory?: string
  actionTypePaletteId: ActionTypePaletteId
}

/** Compact "summary" layout: one action-sequence row per subtask, lexicographically grouped. */
export default function SummaryView({
  messages,
  visibleSubtasks,
  sessionDirectory,
  actionTypePaletteId,
}: SummaryViewProps) {
  const summaryTooltipSafeId = useId().replace(/:/g, '')
  const summaryTooltipId = `subtask-summary-tip-${summaryTooltipSafeId}`
  const [tooltipMounted, setTooltipMounted] = useState(false)
  const [childSessionMessages, setChildSessionMessages] = useState<Record<string, OcMessage[]>>({})
  const summaryViewportRef = useRef<HTMLDivElement | null>(null)
  const [summaryViewportSize, setSummaryViewportSize] = useState({ width: 0, height: 0 })

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
  }, [summarySegments, sessionDirectory])

  useEffect(() => {
    const el = summaryViewportRef.current
    if (!el) return
    const update = () => {
      setSummaryViewportSize({ width: el.clientWidth, height: el.clientHeight })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

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

  return (
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
          arrowColor="var(--color-bg-white)"
        />
      )}
    </>
  )
}
