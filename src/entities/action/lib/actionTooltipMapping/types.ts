/** @deprecated Prefer TooltipBodyLine + buildEnglishTooltipContent */
export type TooltipKeyValue = {
  key: string
  value: string
  sourceHint?: string
}

export type TooltipBodyLine =
  | { kind: 'kv'; key: string; value: string }
  | { kind: 'text'; value: string }
  /** `question` tool: label "About:" + one line per header */
  | { kind: 'about'; headers: string[] }
  /** Full error text (no truncation); rendered with `pre-wrap` + scroll in CSS */
  | { kind: 'error'; value: string }

export type EnglishTooltipContent = {
  /** Bold first token: `part.type` or tool name for `tool` */
  primaryLabel: string
  /** Status text (no key) */
  statusLabel: string
  body: TooltipBodyLine[]
}

export const URL_LIST_MAX = 8
/** Assistant `text` / `reasoning` tooltip body: first N words, then ellipsis */
export const PREVIEW_MAX_WORDS = 300
