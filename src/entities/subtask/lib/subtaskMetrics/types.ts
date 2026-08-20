export interface SubtaskTokenBreakdown {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  /** Equals sum of fields or API `total` when present. */
  total: number
}

export interface SubtaskCardMetrics {
  title: string
  assistantMessageIndices: number[]
  partCount: number
  /** Sum of per-assistant message token totals inside this subtask (segment sum, not delta vs previous subtask; see docs). */
  tokensSegmentSum: number
  tokenBreakdown: SubtaskTokenBreakdown
  llmCallCount: number
  /**
   * **Distinct** file paths touched by write/edit/replace/patch/apply_patch, etc.
   * Deduplicated by path `Set` — **not** the count of write tool invocations.
   */
  mutatedFilePaths: string[]
  mutatedFileCount: number
  /**
   * Read-side approximation: distinct single-path tool inputs (read/grep/list, etc.) + sum of glob `metadata.count`.
   * Includes merged child-session `additionalMessages`. Used for flow-end summaries only — **not** shown in the metric strip.
   */
  readFilesCount: number
  /** Distinct read-tool paths (excludes glob count-only hits). */
  readFilePaths: string[]
  /** Sum of glob tool `meta.count` (approximate matched file count). */
  globMatchFileCount: number
  /** websearch / webfetch query or URL per call (order preserved). */
  webSearchQueries: string[]
  /** websearch / webfetch invocations (equals webSearchQueries.length when every call yields a label). */
  webSearchCallCount: number
  /** Wall-clock span from first `created` to last `completed` (else `created`) in ms. */
  durationMs: number | null
  /** Sum of `info.cost` across assistant messages in this subtask (0 if API omits). */
  costSegmentSum: number
  /**
   * Estimated USD from token breakdown × `TOKEN_COST_RATES_USD` (all rates 0 for now; wire real prices later).
   * If API `cost` is also present, the UI can prefer one or the other.
   */
  costEstimatedUsd: number
  /** Todos newly completed in this segment (= todosNewlyCompleted.length). */
  todosResolvedCount: number
}

/** USD per 1k tokens by kind; all zero until a price table is wired in. */
export const TOKEN_COST_RATES_USD_PER_1K = {
  input: 0,
  output: 0,
  reasoning: 0,
  cacheRead: 0,
  cacheWrite: 0,
} as const