import type { OcMessage, OcMessagePart, ToolPart } from '@/shared/types/opencode'
import {
  formatToolError,
  normalizeToolName,
  num,
  str,
  stringField,
  truncateToMaxWords,
} from './text'
import { extractUrlsFromSearchOutput, parseWebsearchTitleQuery } from './search'
import { buildTodowriteLines } from './todo'
import { PREVIEW_MAX_WORDS, URL_LIST_MAX, type TooltipBodyLine } from './types'

function englishToolBody(part: ToolPart, ctx: { allMessages?: OcMessage[] }): TooltipBodyLine[] {
  const tool = normalizeToolName(part.tool)
  const st = part.state
  const status = st?.status ?? 'unknown'
  const input = (st?.input ?? {}) as Record<string, unknown>
  const meta = (st?.metadata ?? {}) as Record<string, unknown>
  const err = st?.error

  if (status === 'error') {
    const full = formatToolError(err)
    return [{ kind: 'error', value: full || '(no error message)' }]
  }

  switch (tool) {
    case 'read': {
      const fpRaw =
        stringField(input.filePath as string | undefined) ??
        stringField(st?.title as string | undefined)
      const lines: TooltipBodyLine[] = []
      if (fpRaw !== undefined) {
        lines.push({
          kind: 'kv',
          key: 'Read file',
          value: fpRaw === '' ? '(empty)' : fpRaw,
        })
      }
      return lines
    }
    case 'write': {
      const pathRaw =
        stringField(st?.title as string | undefined) ??
        stringField(input.filePath as string | undefined)
      const outRaw = stringField(st?.output as string | undefined)
      const lines: TooltipBodyLine[] = []
      if (pathRaw !== undefined) {
        lines.push({
          kind: 'kv',
          key: 'Write file',
          value: pathRaw === '' ? '(empty)' : pathRaw,
        })
      }
      if (outRaw !== undefined) {
        lines.push({ kind: 'text', value: outRaw === '' ? '(empty)' : outRaw })
      }
      return lines
    }
    case 'edit': {
      const fpRaw =
        stringField(input.filePath as string | undefined) ??
        stringField(st?.title as string | undefined)
      const outRaw = stringField(st?.output as string | undefined)
      const lines: TooltipBodyLine[] = []
      if (fpRaw !== undefined) {
        lines.push({
          kind: 'kv',
          key: 'Edit file',
          value: fpRaw === '' ? '(empty)' : fpRaw,
        })
      }
      if (outRaw !== undefined) {
        lines.push({ kind: 'text', value: outRaw === '' ? '(empty)' : outRaw })
      }
      return lines
    }
    case 'todowrite':
    case 'todoread':
    case 'todo_read':
      return buildTodowriteLines(part, ctx.allMessages)
    case 'bash':
    case 'shell': {
      const lines: TooltipBodyLine[] = []
      const titleRaw = stringField(st?.title as string | undefined)
      if (titleRaw !== undefined) {
        lines.push({ kind: 'text', value: titleRaw === '' ? '(empty)' : titleRaw })
      }
      const cmdRaw = stringField(input.command as string | undefined)
      if (cmdRaw !== undefined) {
        lines.push({ kind: 'kv', key: 'command', value: cmdRaw === '' ? '(empty)' : cmdRaw })
      }
      return lines
    }
    case 'task':
    case 'subtask':
    case 'subagent':
    case 'agent': {
      const stypeRaw = stringField(input.subagent_type as string | undefined)
      const descRaw = stringField(input.description as string | undefined)
      const titleRaw = stringField(st?.title as string | undefined)
      const lines: TooltipBodyLine[] = []
      if (titleRaw !== undefined) {
        lines.push({
          kind: 'kv',
          key: 'title',
          value: titleRaw === '' ? '(empty)' : titleRaw,
        })
      }
      if (stypeRaw !== undefined) {
        lines.push({
          kind: 'kv',
          key: 'subagent',
          value: stypeRaw === '' ? '(empty)' : stypeRaw,
        })
      }
      if (descRaw !== undefined) {
        lines.push({
          kind: 'kv',
          key: 'description',
          value: descRaw === '' ? '(empty)' : descRaw,
        })
      }
      return lines
    }
    case 'grep': {
      const pat = str(input.pattern) ?? ''
      const cnt = num(meta.count)
      const lines: TooltipBodyLine[] = [{ kind: 'kv', key: 'Match', value: pat }]
      if (cnt === 0) lines.push({ kind: 'kv', key: 'result num', value: 'No files found' })
      else
        lines.push({ kind: 'kv', key: 'result num', value: cnt !== undefined ? String(cnt) : '—' })
      return lines
    }
    case 'glob': {
      const pat = str(input.pattern) ?? '*'
      const cnt = num(meta.count)
      const lines: TooltipBodyLine[] = [{ kind: 'kv', key: 'Match', value: pat }]
      if (cnt === 0) lines.push({ kind: 'kv', key: 'result num', value: 'No files found' })
      else
        lines.push({ kind: 'kv', key: 'result num', value: cnt !== undefined ? String(cnt) : '—' })
      return lines
    }
    case 'webfetch': {
      const lines: TooltipBodyLine[] = []
      const t = stringField(st?.title as string | undefined)
      const url = stringField(input.url as string | undefined)
      if (t !== undefined)
        lines.push({ kind: 'kv', key: 'Web fetch', value: t === '' ? '(empty)' : t })
      if (url !== undefined)
        lines.push({ kind: 'kv', key: 'URL', value: url === '' ? '(empty)' : url })
      return lines
    }
    case 'websearch': {
      const titleForQuery = typeof st?.title === 'string' ? st.title : undefined
      const q = str(input.query) ?? parseWebsearchTitleQuery(titleForQuery)
      const nReq = num(input.numResults)
      const outRaw = stringField(st?.output as string | undefined)
      const lines: TooltipBodyLine[] = []
      lines.push({ kind: 'kv', key: 'web search', value: q ?? '(empty)' })
      if (nReq !== undefined) lines.push({ kind: 'kv', key: 'results num', value: String(nReq) })
      if (outRaw) {
        const urls = extractUrlsFromSearchOutput(outRaw, URL_LIST_MAX)
        for (const u of urls) {
          lines.push({ kind: 'kv', key: 'URL', value: u })
        }
      }
      return lines
    }
    case 'list': {
      const p = str(input.path)
      if (p) return [{ kind: 'kv', key: 'List directory', value: p }]
      return []
    }
    case 'codesearch': {
      const q = str(input.query)
      if (q) return [{ kind: 'kv', key: 'Search', value: q }]
      return []
    }
    case 'question': {
      const qs = input.questions as Array<{ header?: string }> | undefined
      const lines: TooltipBodyLine[] = []
      if (Array.isArray(qs)) {
        lines.push({ kind: 'kv', key: 'Answered questions', value: String(qs.length) })
        const headers = qs.map((q) => (typeof q?.header === 'string' ? q.header : ''))
        lines.push({ kind: 'about', headers })
      }
      return lines
    }
    case 'skill': {
      const n = str(input.name)
      if (n) return [{ kind: 'kv', key: 'Skill', value: n }]
      return []
    }
    case 'apply_patch': {
      const files = meta.files
      if (Array.isArray(files)) {
        return [{ kind: 'kv', key: 'Files', value: String(files.length) }]
      }
      const patchTitle = stringField(st?.title as string | undefined)
      if (patchTitle !== undefined) {
        return [{ kind: 'kv', key: 'Patch', value: patchTitle === '' ? '(empty)' : patchTitle }]
      }
      return []
    }
    default: {
      const lines: TooltipBodyLine[] = []
      const titleRaw = stringField(st?.title as string | undefined)
      const outRaw = stringField(st?.output as string | undefined)
      if (titleRaw !== undefined) {
        lines.push({ kind: 'kv', key: 'Title', value: titleRaw === '' ? '(empty)' : titleRaw })
      }
      if (outRaw !== undefined) {
        lines.push({ kind: 'kv', key: 'Output', value: outRaw === '' ? '(empty)' : outRaw })
      }
      return lines
    }
  }
}

function englishNonToolBody(part: OcMessagePart): TooltipBodyLine[] {
  switch (part.type) {
    case 'reasoning': {
      const text = part.text?.trim() ?? ''
      if (!text) return [{ kind: 'text', value: '(empty)' }]
      return [{ kind: 'text', value: truncateToMaxWords(text, PREVIEW_MAX_WORDS) }]
    }
    case 'text': {
      const text = part.text?.trim() ?? ''
      if (!text) return [{ kind: 'text', value: '(empty)' }]
      return [{ kind: 'text', value: truncateToMaxWords(text, PREVIEW_MAX_WORDS) }]
    }
    case 'compaction':
      return [
        { kind: 'kv', key: 'Note', value: 'Context compaction (summary may follow in session).' },
      ]
    default:
      return [{ kind: 'kv', key: 'Part', value: part.type }]
  }
}

export function buildTooltipBody(
  part: OcMessagePart,
  ctx: { allMessages?: OcMessage[] } = {},
): TooltipBodyLine[] {
  if (part.type === 'tool') return englishToolBody(part, ctx)
  return englishNonToolBody(part)
}
