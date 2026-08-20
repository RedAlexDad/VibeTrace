import type { MappedAction, OcMessage } from '@/shared/types/opencode'
import { buildEnglishTooltipContent } from './content'
import { resolvePartForAction } from './lookup'
import { escapeForActionTooltip } from './text'
import type { EnglishTooltipContent, TooltipKeyValue } from './types'

export function formatEnglishTooltipContentHtml(
  content: EnglishTooltipContent,
  escapeHtml: (s: string) => string,
): string {
  const head = `<div class="action-tip-head"><strong class="action-tip-primary">${escapeHtml(content.primaryLabel)}</strong><span class="action-tip-status">${escapeHtml(content.statusLabel)}</span></div>`
  const bodyHtml = content.body
    .map((line) => {
      if (line.kind === 'kv') {
        return `<div class="action-tip-kv"><span class="action-tip-k">${escapeHtml(line.key)}</span><span class="action-tip-v">${escapeHtml(line.value)}</span></div>`
      }
      if (line.kind === 'about') {
        const headersHtml = line.headers
          .map((h) => `<div class="action-tip-about-line">${escapeHtml(h)}</div>`)
          .join('')
        return `<div class="action-tip-about"><div class="action-tip-about-label">About:</div>${headersHtml}</div>`
      }
      if (line.kind === 'error') {
        return `<div class="action-tip-error">${escapeHtml(line.value)}</div>`
      }
      return `<div class="action-tip-text">${escapeHtml(line.value)}</div>`
    })
    .join('')
  return `${head}<div class="action-tip-body">${bodyHtml}</div>`
}

/**
 * Compact tooltip shared by the action flow + treemap — body prefers parsed tool parts, else falls back to
 * `actionType` / `status` / `detail`. Footer shows duration + rough token estimate.
 */
export function buildCompactMappedActionTooltipHtml(
  act: MappedAction & { row: number },
  tooltipMessages: OcMessage[] | undefined,
  formatDurationMs: (ms: number) => string,
): string {
  if (act.actionType === 'UserRequest') {
    const text = act.detail?.trim() || '(empty)'
    return `<div class="action-tip-root action-tip-root--compact"><div class="action-tip-compact-main"><div class="action-tip-compact-head"><strong>${escapeForActionTooltip(
      'user request',
    )}</strong></div><div class="action-tip-compact-lines"><div class="action-tip-compact-line">${escapeForActionTooltip(
      text,
    )}</div></div></div></div>`
  }

  let main = ''
  if (tooltipMessages?.length) {
    const part = resolvePartForAction(tooltipMessages, act)
    if (part) {
      const kv = buildEnglishTooltipContent(part, { allMessages: tooltipMessages })
      const lines = kv.body.flatMap((row) => {
        if (row.kind === 'kv') return [`${row.key}: ${row.value}`]
        if (row.kind === 'error') return [row.value]
        if (row.kind === 'about') return ['About:', ...row.headers]
        return [row.value]
      })
      main = `<div class="action-tip-compact-main"><div class="action-tip-compact-head"><strong>${escapeForActionTooltip(
        kv.primaryLabel,
      )}</strong> <span class="action-tip-compact-status">${escapeForActionTooltip(kv.statusLabel)}</span></div>${
        lines.length
          ? `<div class="action-tip-compact-lines">${lines
              .map((l) => `<div class="action-tip-compact-line">${escapeForActionTooltip(l)}</div>`)
              .join('')}</div>`
          : ''
      }</div>`
    }
  }
  if (!main) {
    const d = act.detail?.trim() ?? ''
    const err = act.errorMessage?.trim() ?? ''
    const snippet = d || err
    const detailLine = snippet
      ? `<div class="action-tip-compact-lines"><div class="action-tip-compact-line">${escapeForActionTooltip(
          snippet.length > 220 ? `${snippet.slice(0, 220)}…` : snippet,
        )}</div></div>`
      : ''
    main = `<div class="action-tip-compact-main"><div class="action-tip-compact-head"><strong>${escapeForActionTooltip(
      act.actionType,
    )}</strong> <span class="action-tip-compact-status">${escapeForActionTooltip(act.status)}</span></div>${detailLine}</div>`
  }
  const dur = formatDurationMs(act.durationMs)
  const tokenSuffix =
    Number.isFinite(act.tokenEstimate) && act.tokenEstimate >= 0
      ? ` · ${Math.round(act.tokenEstimate).toLocaleString('en-US')} tokens`
      : ''
  const foot = `<div class="action-tip-compact-footer">${escapeForActionTooltip(dur)}${tokenSuffix}</div>`
  return `<div class="action-tip-root action-tip-root--compact">${main}${foot}</div>`
}

export function formatTooltipKeyValuesAsHtml(
  rows: TooltipKeyValue[],
  escapeHtml: (s: string) => string,
): string {
  return rows
    .map(
      (r) =>
        `<div class="action-tip-kv"><span class="action-tip-k">${escapeHtml(r.key)}</span><span class="action-tip-v">${escapeHtml(r.value)}</span></div>`,
    )
    .join('')
}
