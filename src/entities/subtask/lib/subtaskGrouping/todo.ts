import type { OcMessage, OcTodo, ToolPart } from '@/shared/types/opencode'

const TODO_WRITE_TOOL_NAMES = new Set(['todowrite', 'todo_write', 'write_todos', 'update_todos'])

export function isTodoWriteTool(toolName: string): boolean {
  const t = toolName.toLowerCase().replace(/-/g, '_')
  if (TODO_WRITE_TOOL_NAMES.has(t)) return true
  if (t.includes('todo_write')) return true
  if (t.endsWith('_todowrite')) return true
  return false
}

export function isTodoWriteMessage(message: OcMessage): boolean {
  if (message.info.role !== 'assistant') return false
  return message.parts.some((p) => p.type === 'tool' && isTodoWriteTool(p.tool))
}

function shallowCloneTodo(t: OcTodo): OcTodo {
  return { ...t, ...(t.id ? { id: t.id } : {}) }
}

function normalizeStatus(raw: unknown): OcTodo['status'] {
  const s = String(raw ?? '')
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (s === 'completed' || s === 'complete') return 'completed'
  if (s === 'in_progress' || s === 'inprogress' || s === 'in-progress') return 'in_progress'
  return 'pending'
}

function normalizePriority(raw: unknown): OcTodo['priority'] {
  const s = String(raw ?? 'medium').toLowerCase()
  if (s === 'high') return 'high'
  if (s === 'low') return 'low'
  return 'medium'
}

function normalizeRawTodoItem(item: unknown): OcTodo | null {
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  const content = o.content
  if (typeof content !== 'string' || !content.trim()) return null
  const idRaw = o.id
  const id = typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : undefined
  return {
    content: content.trim(),
    status: normalizeStatus(o.status),
    priority: normalizePriority(o.priority),
    ...(id ? { id } : {}),
  }
}

function normalizeRawTodos(raw: unknown[]): OcTodo[] {
  const out: OcTodo[] = []
  for (const x of raw) {
    const t = normalizeRawTodoItem(x)
    if (t) out.push(t)
  }
  return out
}

function extractTodosArray(raw: unknown): OcTodo[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const list = normalizeRawTodos(raw)
  return list.length > 0 ? list : null
}

type ToolStateWithMeta = ToolPart['state'] & {
  metadata?: { todos?: unknown }
}

/** Todo list resolution order for one todowrite tool part: input.todos → metadata.todos → output JSON */
export function parseTodowriteTodosFromToolPart(part: ToolPart): OcTodo[] | null {
  const input = part.state?.input
  const fromInput = extractTodosArray(input?.todos)
  if (fromInput) return fromInput

  const meta = (part.state as ToolStateWithMeta | undefined)?.metadata
  const fromMeta = extractTodosArray(meta?.todos)
  if (fromMeta) return fromMeta

  const out = part.state?.output
  if (typeof out === 'string' && out.trim()) {
    try {
      const j = JSON.parse(out) as unknown
      if (Array.isArray(j)) {
        const list = normalizeRawTodos(j)
        if (list.length > 0) return list
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

/** Parse first todowrite todos from an assistant message */
export function parseTodowriteTodosFromMessage(message: OcMessage): OcTodo[] | null {
  if (message.info.role !== 'assistant') return null
  for (const p of message.parts) {
    if (p.type !== 'tool') continue
    if (!isTodoWriteTool(p.tool)) continue
    const list = parseTodowriteTodosFromToolPart(p)
    if (list && list.length > 0) return list
  }
  return null
}

/** Prefer id, else normalized content string, for aligning snapshots across time */
export function todoMatchKey(t: OcTodo): string {
  if (t.id?.trim()) return `id:${t.id.trim()}`
  return `c:${t.content.trim()}`
}

/**
 * Items whose same todo key (prefer id) moved **non-completed → completed** vs the previous snapshot.
 */
export function diffTodosNewlyCompleted(prev: OcTodo[] | null, next: OcTodo[]): OcTodo[] {
  if (!prev || prev.length === 0) return []
  const prevByKey = new Map<string, OcTodo>()
  for (const t of prev) {
    prevByKey.set(todoMatchKey(t), t)
  }
  const out: OcTodo[] = []
  for (const n of next) {
    if (n.status !== 'completed') continue
    const p = prevByKey.get(todoMatchKey(n))
    if (p && p.status !== 'completed') {
      out.push(shallowCloneTodo(n))
    }
  }
  return out
}

export function cloneTodo(t: OcTodo): OcTodo {
  return shallowCloneTodo(t)
}
