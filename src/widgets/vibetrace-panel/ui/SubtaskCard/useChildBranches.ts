import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MappedAction, OcMessage } from '@/shared/types/opencode'
import {
  buildChildSessionBandMap,
  buildChildSessionBranchActions,
  collectTaskChildDescriptors,
  detectParallelCallMapping,
  extractChildSessionIdFromToolPart,
  isSubagentToolName,
} from '@/entities/action/lib/actionMapping'
import { getMessages } from '@/shared/api/opencodeApi'

/**
 * Loads child-session actions/messages for the subtask's parent segment.
 * Re-polls while a child task is running.
 */
export default function useChildBranches({
  segmentMessages,
  sessionDirectory,
  nowMs,
}: {
  segmentMessages: OcMessage[]
  sessionDirectory?: string
  nowMs: number
}) {
  const [childBranchActions, setChildBranchActions] = useState<(MappedAction & { row: number })[]>(
    [],
  )
  /** Raw child-session messages merged into Changes (write/edit paths) */
  const [childBranchMessages, setChildBranchMessages] = useState<OcMessage[]>([])

  const nowMsRef = useRef(nowMs)
  nowMsRef.current = nowMs

  const taskDescriptors = useMemo(
    () => collectTaskChildDescriptors(segmentMessages),
    [segmentMessages],
  )
  const parallelByCallId = useMemo(
    () => detectParallelCallMapping(segmentMessages, nowMs),
    [segmentMessages, nowMs],
  )
  /** Parallel children share one band lane; sequential children still bump by session id order */
  const childSessionBandMap = useMemo(
    () => buildChildSessionBandMap(taskDescriptors, parallelByCallId),
    [taskDescriptors, parallelByCallId],
  )

  const hasRunningTaskWithChild = useMemo(() => {
    return segmentMessages.some((msg) => {
      if (msg.info.role !== 'assistant') return false
      return msg.parts.some((p) => {
        if (p.type !== 'tool' || !isSubagentToolName(p.tool)) return false
        if (p.state?.status !== 'running') return false
        return Boolean(extractChildSessionIdFromToolPart(p))
      })
    })
  }, [segmentMessages])

  const loadChildBranches = useCallback(async () => {
    if (taskDescriptors.length === 0) {
      setChildBranchActions([])
      setChildBranchMessages([])
      return
    }
    const results = await Promise.all(
      taskDescriptors.map(async (d) => {
        try {
          const msgs = await getMessages(
            d.childSessionID,
            `Child session · ${d.callID.slice(0, 12)}`,
            sessionDirectory,
          )
          const branchOpts = {
            branchChildSessionID: d.childSessionID,
            parentTaskCallID: d.callID,
            anchorSortTime: d.anchorSortTime,
            /** Stable lane index per distinct child session: first unique id = 1, second = 2, … */
            sessionBandIndex: childSessionBandMap.get(d.childSessionID) ?? 1,
            nowMs: nowMsRef.current,
          }
          const actions = buildChildSessionBranchActions(msgs, branchOpts)
          return { msgs, actions }
        } catch {
          return {
            msgs: [] as OcMessage[],
            actions: [] as (MappedAction & { row: number })[],
          }
        }
      }),
    )
    setChildBranchActions(results.flatMap((r) => r.actions))
    setChildBranchMessages(results.flatMap((r) => r.msgs))
  }, [taskDescriptors, sessionDirectory, childSessionBandMap])

  useEffect(() => {
    void loadChildBranches()
  }, [loadChildBranches])

  useEffect(() => {
    if (!hasRunningTaskWithChild) return
    const id = window.setInterval(() => {
      void loadChildBranches()
    }, 3200)
    return () => window.clearInterval(id)
  }, [hasRunningTaskWithChild, loadChildBranches])

  return {
    childBranchActions,
    childBranchMessages,
    hasRunningTaskWithChild,
    parallelByCallId,
  }
}
