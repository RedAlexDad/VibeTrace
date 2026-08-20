import type { FlowEndSummary } from './types'

/** Vertical center the active rows inside `totalH` by translating the content `<g>`. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const FLOW_END_MAX_LINES = 12
export const FLOW_END_PATH_MAX_CHARS = 72

export function truncatePathForFlowEnd(p: string): string {
  const t = p.trim()
  if (t.length <= FLOW_END_PATH_MAX_CHARS) return t
  return `${t.slice(0, FLOW_END_PATH_MAX_CHARS - 1)}…`
}

export function flowEndListRows(
  items: string[],
  esc: (s: string) => string,
): { html: string; more: number } {
  const shown = items.slice(0, FLOW_END_MAX_LINES)
  const more = items.length > shown.length ? items.length - shown.length : 0
  const html = shown
    .map(
      (p) =>
        `<div style="font-family:ui-monospace,Consolas,monospace;font-size:11px;line-height:1.4;color:var(--color-ink);">${esc(truncatePathForFlowEnd(p))}</div>`,
    )
    .join('')
  return { html, more }
}

export function buildFlowEndTooltipHtml(s: FlowEndSummary): string {
  const esc = escapeHtml
  const readPaths = s.readFilePaths ?? []
  const writePaths = s.changedFilePaths ?? []
  const queries = s.webSearchQueries ?? []

  const readList = flowEndListRows(readPaths, esc)
  const readMore =
    readList.more > 0
      ? `<div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px;">+ ${readList.more} more</div>`
      : ''
  const globLine =
    s.globMatchFileCount > 0
      ? `<div style="font-size:11px;color:var(--color-text-secondary);margin-top:6px;">Glob · ~${esc(String(s.globMatchFileCount))} file(s) matched</div>`
      : ''

  const qList = flowEndListRows(queries, esc)
  const qMore =
    qList.more > 0
      ? `<div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px;">+ ${qList.more} more</div>`
      : ''

  const writeList = flowEndListRows(writePaths, esc)
  const writeMore =
    writeList.more > 0
      ? `<div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px;">+ ${writeList.more} more</div>`
      : ''

  return `<div class="action-tip-root action-tip-root--compact" style="text-align:left;max-width:min(440px,92vw);">
<div style="font-size:12px;font-weight:600;color:var(--color-ink);margin-bottom:4px;">Read</div>
<div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:6px;">${esc(String(s.readFileTotalCount))} file(s) (paths + glob)</div>
${readList.html}${readMore}${globLine}
<div style="font-size:12px;font-weight:600;color:var(--color-ink);margin-top:10px;margin-bottom:4px;">Web search</div>
<div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:6px;">${esc(String(s.webSearchCount))} call(s) · keywords / URLs</div>
${qList.html}${qMore}
<div style="font-size:12px;font-weight:600;color:var(--color-ink);margin-top:10px;margin-bottom:4px;">Write / edit</div>
<div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:6px;">${esc(String(s.writeFileCount))} file(s)</div>
${writeList.html}${writeMore}
</div>`
}
