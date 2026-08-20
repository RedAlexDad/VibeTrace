import { useEffect, useMemo, useState } from 'react'
import type { MappedAction } from '@/shared/types/opencode'
import { formatDurationMs } from '@/entities/subtask/lib/subtaskMetrics'
import type { FilterMode } from './types'

function domainOf(actions: MappedAction[], pick: (a: MappedAction) => number | undefined | null) {
  const vals: number[] = []
  for (const a of actions) {
    const v = pick(a)
    if (Number.isFinite(v) && (v as number) >= 0) vals.push(v as number)
  }
  if (!vals.length) return null
  return { min: Math.min(...vals), max: Math.max(...vals) }
}

export default function useFilter({
  flowActions,
  subtaskSig,
  filterMode,
}: {
  flowActions: (MappedAction & { row: number })[]
  subtaskSig: string
  filterMode: FilterMode
}) {
  const durationDomain = useMemo(
    () => domainOf(flowActions, (a) => a.durationMs),
    [flowActions],
  )
  const tokenDomain = useMemo(
    () => domainOf(flowActions, (a) => a.tokenEstimate),
    [flowActions],
  )
  const [durationHighlightMinMs, setDurationHighlightMinMs] = useState(0)
  const [tokenHighlightMin, setTokenHighlightMin] = useState(0)
  const [filterTouched, setFilterTouched] = useState(false)
  useEffect(() => {
    setFilterTouched(false)
    setDurationHighlightMinMs(0)
    setTokenHighlightMin(0)
  }, [subtaskSig])
  useEffect(() => {
    if (!durationDomain) {
      setDurationHighlightMinMs(0)
      return
    }
    setDurationHighlightMinMs((prev) => {
      if (prev < durationDomain.min || prev > durationDomain.max) return durationDomain.min
      return prev
    })
  }, [durationDomain])
  useEffect(() => {
    if (!tokenDomain) {
      setTokenHighlightMin(0)
      return
    }
    setTokenHighlightMin((prev) => {
      if (prev < tokenDomain.min || prev > tokenDomain.max) return tokenDomain.min
      return prev
    })
  }, [tokenDomain])
  const durationHighlightStep = useMemo(() => {
    if (!durationDomain) return 1
    return Math.max(1, Math.round((durationDomain.max - durationDomain.min) / 240))
  }, [durationDomain])
  const tokenHighlightStep = useMemo(() => {
    if (!tokenDomain) return 1
    return Math.max(1, Math.round((tokenDomain.max - tokenDomain.min) / 240))
  }, [tokenDomain])
  const activeFilterDomain = filterMode === 'duration' ? durationDomain : tokenDomain
  const activeFilterStep = filterMode === 'duration' ? durationHighlightStep : tokenHighlightStep
  const activeFilterValue = filterMode === 'duration' ? durationHighlightMinMs : tokenHighlightMin
  const effectiveFilterMin = useMemo(() => {
    if (!activeFilterDomain) return 0
    return filterTouched ? activeFilterValue : activeFilterDomain.min
  }, [activeFilterDomain, filterTouched, activeFilterValue])
  const matchedActionCount = useMemo(() => {
    if (filterMode === 'duration') {
      if (!durationDomain) return flowActions.length
      return flowActions.filter(
        (a) => Number.isFinite(a.durationMs) && a.durationMs >= effectiveFilterMin,
      ).length
    }
    if (!tokenDomain) return flowActions.length
    return flowActions.filter(
      (a) => Number.isFinite(a.tokenEstimate) && a.tokenEstimate >= effectiveFilterMin,
    ).length
  }, [filterMode, flowActions, durationDomain, tokenDomain, effectiveFilterMin])
  const activeFilterMaxLabel = useMemo(() => {
    if (!activeFilterDomain) return ''
    if (filterMode === 'duration') return formatDurationMs(activeFilterDomain.max)
    return `${Math.round(activeFilterDomain.max)} tok`
  }, [filterMode, activeFilterDomain])
  /** Dim only once the slider moves above domain min — default min matches “no filter” */
  const durationHighlightForFlow =
    filterMode === 'duration' &&
    filterTouched &&
    durationDomain != null &&
    durationHighlightMinMs > durationDomain.min
      ? durationHighlightMinMs
      : null
  const tokenHighlightForFlow =
    filterMode === 'tokens' &&
    filterTouched &&
    tokenDomain != null &&
    tokenHighlightMin > tokenDomain.min
      ? tokenHighlightMin
      : null

  const setHighlightMin = (value: number) => {
    setFilterTouched(true)
    if (filterMode === 'duration') {
      setDurationHighlightMinMs(value)
      return
    }
    setTokenHighlightMin(value)
  }

  return {
    durationDomain,
    tokenDomain,
    durationHighlightMinMs,
    tokenHighlightMin,
    filterTouched,
    durationHighlightStep,
    tokenHighlightStep,
    activeFilterDomain,
    activeFilterStep,
    activeFilterValue,
    effectiveFilterMin,
    matchedActionCount,
    activeFilterMaxLabel,
    durationHighlightForFlow,
    tokenHighlightForFlow,
    setHighlightMin,
  }
}