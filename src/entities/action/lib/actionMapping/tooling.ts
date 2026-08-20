import type { ActionType, ToolPart } from '@/shared/types/opencode'
import { isTodoWriteTool } from '@/entities/subtask/lib/subtaskGrouping'

const SUBAGENT_TOOLS = new Set(['task', 'subtask', 'subagent', 'agent'])

function normalizeToolName(name: string): string {
  return name.trim().toLowerCase().replace(/-/g, '_')
}

export function mapToolToActionType(tool: string): ActionType | null {
  const t = normalizeToolName(tool)
  if (t === 'question') return 'Clarify'
  if (isTodoWriteTool(tool) || t === 'todoread' || t === 'todo_read') return 'Plan'
  if (SUBAGENT_TOOLS.has(t)) return 'Subagent'
  if (['glob', 'grep', 'read'].includes(t)) return 'Read'
  if (['write', 'edit', 'multiedit', 'patch'].includes(t)) return 'Write'
  if (t === 'bash' || t === 'shell') return 'Shell'
  if (t === 'websearch' || t === 'web_fetch' || t === 'webfetch') return 'Search'
  // MCP tools arrive as `mcp__<server>__<tool>`; skills as `skill`
  if (t === 'skill' || t.startsWith('mcp__') || t.startsWith('skill_')) return 'Skill'
  return null
}

export function isSubagentToolName(tool: string): boolean {
  const t = normalizeToolName(tool)
  return SUBAGENT_TOOLS.has(t)
}

function parseToolError(errorRaw?: string): { name?: string; message?: string } {
  const text = (errorRaw ?? '').trim()
  if (!text) return {}
  const firstColon = text.indexOf(':')
  if (firstColon <= 0) return { name: text, message: text }
  const name = text.slice(0, firstColon).trim()
  const message = text.slice(firstColon + 1).trim()
  return {
    name: name || text,
    message: message || text,
  }
}

function pickFirstString(values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

function parseJsonRecord(raw?: string): Record<string, unknown> | null {
  if (!raw || !raw.trim()) return null
  try {
    const v = JSON.parse(raw) as unknown
    if (v && typeof v === 'object') return v as Record<string, unknown>
  } catch {
    /* ignore */
  }
  return null
}

/**
 * 统一提取 task/subagent 的子会话 id。
 * 兼容 running/completed 两阶段里可能出现的字段：
 * - state.metadata.sessionId / sessionID / task_id
 * - state.output 文本中的 task_id: xxx
 * - state.output JSON 的 metadata.sessionId / sessionId
 */
export function extractChildSessionIdFromToolPart(part: ToolPart): string | undefined {
  const input = part.state?.input ?? {}
  const meta = (part.state?.metadata ?? {}) as Record<string, unknown>
  const out = part.state?.output ?? ''
  const outJson = parseJsonRecord(out)
  const outMeta =
    outJson && typeof outJson.metadata === 'object' && outJson.metadata
      ? (outJson.metadata as Record<string, unknown>)
      : {}

  const direct = pickFirstString([
    meta.sessionId,
    meta.sessionID,
    meta.task_id,
    outMeta.sessionId,
    outMeta.sessionID,
    outMeta.task_id,
    outJson?.sessionId,
    outJson?.sessionID,
    outJson?.task_id,
    input.sessionId,
    input.sessionID,
  ])
  if (direct) return direct

  const m = out.match(/task_id:\s*([A-Za-z0-9_-]+)/i)
  if (m?.[1]) return m[1]
  return undefined
}

export { parseToolError, parseJsonRecord }
