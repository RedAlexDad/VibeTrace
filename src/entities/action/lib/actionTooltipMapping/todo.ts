import type { OcMessage, ToolPart } from '@/shared/types/opencode'
import { normalizeToolName } from './text'
import type { TooltipBodyLine } from './types'

type TodoRaw = { status?: string; content?: string; id?: string }

function countCompleted(todos: TodoRaw[]): number {
  return todos.filter((t) => (t.status ?? '') === 'completed').length
}

function countPending(todos: TodoRaw[]): number {
  return todos.filter((t) => {
    const s = (t.status ?? '').toLowerCase()
    return s === 'pending' || s === 'in_progress'
  }).length
}

function getTodosArray(part: ToolPart): TodoRaw[] {
  const meta = part.state?.metadata as Record<string, unknown> | undefined
  const input = part.state?.input as Record<string, unknown> | undefined
  const raw = meta?.todos ?? input?.todos
  return Array.isArray(raw) ? (raw as TodoRaw[]) : []
}

/** All `todowrite` tool parts in timeline order (assistant messages only). */
function collectTodowriteToolParts(messages: OcMessage[]): ToolPart[] {
  const out: ToolPart[] = []
  for (const message of messages) {
    if (message.info.role !== 'assistant') continue
    for (const p of message.parts) {
      if (p.type === 'tool' && normalizeToolName(p.tool) === 'todowrite') {
        out.push(p)
      }
    }
  }
  return out
}

export function buildTodowriteLines(
  part: ToolPart,
  allMessages: OcMessage[] | undefined,
): TooltipBodyLine[] {
  const curr = getTodosArray(part)
  const msgs = allMessages ?? []
  const list = collectTodowriteToolParts(msgs)
  const idx = list.findIndex((p) => p.id === part.id)
  const prev = idx > 0 ? getTodosArray(list[idx - 1]!) : undefined
  const isInitial = idx <= 0

  const prevCompleted = prev ? countCompleted(prev) : 0
  const currCompleted = countCompleted(curr)
  const currPending = countPending(curr)
  const total = curr.length
  const completedThisRun = Math.max(0, currCompleted - prevCompleted)

  const lines: TooltipBodyLine[] = [
    {
      kind: 'kv',
      key: 'Operation',
      value: isInitial ? 'Initial todo list' : 'Update todo list',
    },
    {
      kind: 'kv',
      key: 'Completed this run',
      value: String(completedThisRun),
    },
    {
      kind: 'kv',
      key: 'Total completed',
      value: `${currCompleted} / ${total}`,
    },
    {
      kind: 'kv',
      key: 'Pending',
      value: String(currPending),
    },
  ]
  return lines
}