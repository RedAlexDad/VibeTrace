import type { OcSession, OcTodo, OcMessage, OcPendingQuestionItem } from '@/shared/types/opencode'
import {
  BASE,
  extractProjectDirectory,
  normalizeDirectoryLike,
  parseModelRefToBody,
  withDirectoryHeaders,
} from './config'
import { normalizePendingQuestionList } from './types'
import type { OcComposerModelOption, UserMessagePartBody } from './types'

// ===== REST API =====

export async function getSessions(options?: { directory?: string }): Promise<OcSession[]> {
  const url = `${BASE}/session`
  const res = await fetch(url, { headers: withDirectoryHeaders({}, options?.directory) })
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`)
  return res.json()
}

export async function getProjectDirectories(): Promise<string[]> {
  const set = new Set<string>()

  const pull = async (url: string, label: string) => {
    const res = await fetch(url, { headers: withDirectoryHeaders({}) })
    if (!res.ok) {
      throw new Error(`${label} failed: ${res.status}`)
    }
    const data = await res.json()
    const list = Array.isArray(data) ? data : [data]
    for (const item of list) {
      const dir = extractProjectDirectory(item)
      if (dir) set.add(dir)
    }
  }

  try {
    await pull(`${BASE}/project`, 'GET /project')
  } catch {
    /* ignore — optional endpoint */
  }
  try {
    await pull(`${BASE}/project/current`, 'GET /project/current')
  } catch {
    /* ignore — optional endpoint */
  }

  return [...set]
}

export async function getCurrentWorkspaceDirectory(): Promise<string | null> {
  const res = await fetch(`${BASE}/path`, { headers: withDirectoryHeaders({}) })
  if (!res.ok) {
    throw new Error(`GET /path failed: ${res.status}`)
  }
  const data = await res.json()
  if (typeof data === 'string') return normalizeDirectoryLike(data)
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    const dir =
      normalizeDirectoryLike(obj.directory) ||
      normalizeDirectoryLike(obj.path) ||
      normalizeDirectoryLike(obj.cwd) ||
      normalizeDirectoryLike(obj.root)
    if (dir) return dir
  }
  return null
}

export async function createSession(directory?: string): Promise<OcSession> {
  const url = `${BASE}/session`
  const headers = withDirectoryHeaders({ 'Content-Type': 'application/json' }, directory)
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  })
  const bodyText = await res.text()
  if (!res.ok) {
    throw new Error(`Failed to create session: ${res.status} ${bodyText}`)
  }
  const trimmed = bodyText.trim()
  if (trimmed) {
    try {
      return JSON.parse(trimmed) as OcSession
    } catch {
      /* fall through to session list fallback */
    }
  }

  const list = await getSessions(directory ? { directory } : undefined)
  const sorted = [...list].sort((a, b) => b.time.updated - a.time.updated)
  const pick = sorted[0]
  if (!pick) {
    throw new Error(
      'Create session: empty response and no sessions returned for this directory. Check OpenCode server logs.',
    )
  }
  return pick
}

export async function updateSessionTitle(
  sessionId: string,
  title: string,
  directory?: string,
): Promise<OcSession> {
  const url = `${BASE}/session/${sessionId}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: withDirectoryHeaders({ 'Content-Type': 'application/json' }, directory),
    body: JSON.stringify({ title }),
  })
  const bodyText = await res.text()
  if (!res.ok) {
    throw new Error(`Failed to update session title: ${res.status} ${bodyText}`)
  }
  return JSON.parse(bodyText) as OcSession
}

export async function deleteSession(sessionId: string, directory?: string): Promise<void> {
  const url = `${BASE}/session/${sessionId}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: withDirectoryHeaders({}, directory),
  })
  const bodyText = await res.text()
  if (!res.ok) {
    throw new Error(`deleteSession failed: ${res.status} ${bodyText}`)
  }
}

export async function getTodos(sessionId: string, directory?: string): Promise<OcTodo[]> {
  const url = `${BASE}/session/${sessionId}/todo`
  const res = await fetch(url, { headers: withDirectoryHeaders({}, directory) })
  if (!res.ok) throw new Error(`Failed to fetch todos: ${res.status}`)
  return res.json()
}

export async function getMessages(
  sessionId: string,
  _reason?: string,
  directory?: string,
): Promise<OcMessage[]> {
  const url = `${BASE}/session/${sessionId}/message`
  const res = await fetch(url, { headers: withDirectoryHeaders({}, directory) })
  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.status}`)
  return res.json()
}

/**
 * Matches OpenCode HTTP API `GET /config/providers` (desktop/TUI use the same provider registry).
 * Response shape: `{ providers: ProviderInfo[], default: Record<string, string> }`.
 */
export async function getComposerModelOptions(directory?: string): Promise<{
  options: OcComposerModelOption[]
  defaultByProvider: Record<string, string>
}> {
  const url = `${BASE}/config/providers`
  const res = await fetch(url, { headers: withDirectoryHeaders({}, directory) })
  const bodyText = await res.text()
  if (!res.ok) {
    throw new Error(`GET /config/providers failed: ${res.status} ${bodyText.slice(0, 400)}`)
  }
  let data: unknown
  try {
    data = JSON.parse(bodyText) as unknown
  } catch {
    throw new Error('GET /config/providers returned non-JSON')
  }
  const obj = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const providersRaw = obj.providers
  const providers = Array.isArray(providersRaw) ? providersRaw : []
  const opts: OcComposerModelOption[] = []
  for (const p of providers) {
    if (!p || typeof p !== 'object') continue
    const pr = p as Record<string, unknown>
    const pid = typeof pr.id === 'string' ? pr.id.trim() : ''
    if (!pid) continue
    const models =
      pr.models && typeof pr.models === 'object' ? (pr.models as Record<string, unknown>) : {}
    for (const m of Object.values(models)) {
      if (!m || typeof m !== 'object') continue
      const mr = m as Record<string, unknown>
      const mid = typeof mr.id === 'string' ? mr.id.trim() : ''
      if (!mid) continue
      const name = typeof mr.name === 'string' ? mr.name.trim() : ''
      const label = name && name !== mid ? `${pid}/${mid} — ${name}` : `${pid}/${mid}`
      opts.push({ ref: `${pid}/${mid}`, label })
    }
  }
  opts.sort((a, b) => a.ref.localeCompare(b.ref))
  const defRaw = obj.default
  const defaultByProvider =
    defRaw && typeof defRaw === 'object' && !Array.isArray(defRaw)
      ? { ...(defRaw as Record<string, string>) }
      : {}
  return { options: opts, defaultByProvider }
}

export async function sendMessage(
  sessionId: string,
  text: string,
  directory?: string,
  options?: {
    imageParts?: Array<{ media_type: string; data: string }>
    model?: string
    agent?: string
  },
): Promise<void> {
  const url = `${BASE}/session/${sessionId}/message`
  const imageParts: UserMessagePartBody[] = (options?.imageParts ?? []).map((img) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: img.media_type,
      data: img.data,
    },
  }))
  const parts: UserMessagePartBody[] = [...imageParts, { type: 'text', text }]
  const modelRef =
    (options?.model && options.model.trim()) ||
    (typeof import.meta.env.VITE_OPENCODE_DEFAULT_MODEL === 'string' &&
      import.meta.env.VITE_OPENCODE_DEFAULT_MODEL.trim()) ||
    undefined
  const modelBody = modelRef ? parseModelRefToBody(modelRef) : undefined
  const agent =
    (options?.agent && options.agent.trim()) ||
    (typeof import.meta.env.VITE_OPENCODE_DEFAULT_AGENT === 'string' &&
      import.meta.env.VITE_OPENCODE_DEFAULT_AGENT.trim()) ||
    undefined
  const reqBody: Record<string, unknown> = { parts }
  if (modelBody) reqBody.model = modelBody
  if (agent) reqBody.agent = agent

  const res = await fetch(url, {
    method: 'POST',
    headers: withDirectoryHeaders({ 'Content-Type': 'application/json' }, directory),
    body: JSON.stringify(reqBody),
  })
  const bodyText = await res.text()
  if (!res.ok) throw new Error(`Failed to send message: ${res.status} ${bodyText}`)
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/html') || /^\s*</i.test(bodyText)) {
    throw new Error(
      `[OpenCode] POST /message returned HTML instead of JSON — check the path. Expected /session/<sessionId>/message (not /session}/). URL: ${url}`,
    )
  }
}

export async function abortSession(sessionId: string, directory?: string): Promise<void> {
  const url = `${BASE}/session/${sessionId}/abort`
  const res = await fetch(url, {
    method: 'POST',
    headers: withDirectoryHeaders({}, directory),
  })
  const bodyText = await res.text()
  if (!res.ok) {
    throw new Error(`abortSession failed: ${res.status} ${bodyText}`)
  }
}

export async function forkSession(
  sessionId: string,
  options?: { messageID?: string; directory?: string },
): Promise<OcSession> {
  const url = `${BASE}/session/${sessionId}/fork`
  const body = options?.messageID ? { messageID: options.messageID } : {}
  const res = await fetch(url, {
    method: 'POST',
    headers: withDirectoryHeaders({ 'Content-Type': 'application/json' }, options?.directory),
    body: JSON.stringify(body),
  })
  const bodyText = await res.text()
  if (!res.ok) {
    throw new Error(`forkSession failed: ${res.status} ${bodyText}`)
  }
  return JSON.parse(bodyText) as OcSession
}

export async function replyToQuestion(
  requestId: string,
  answers: string[][],
  directory?: string,
): Promise<void> {
  const url = `${BASE}/question/${encodeURIComponent(requestId)}/reply`
  const res = await fetch(url, {
    method: 'POST',
    headers: withDirectoryHeaders({ 'Content-Type': 'application/json' }, directory),
    body: JSON.stringify({ answers }),
  })
  const bodyText = await res.text()
  if (!res.ok) {
    throw new Error(`replyToQuestion failed: ${res.status} ${bodyText}`)
  }
}

export async function getPendingQuestions(
  directory?: string,
  options?: { sessionID?: string },
): Promise<OcPendingQuestionItem[]> {
  const buildUrl = (includeSession: boolean) => {
    const params = new URLSearchParams()
    if (directory) params.set('directory', directory)
    if (includeSession && options?.sessionID) params.set('sessionID', options.sessionID)
    const qs = params.toString()
    return qs ? `${BASE}/question?${qs}` : `${BASE}/question`
  }

  const fetchList = async (url: string) => {
    const res = await fetch(url, { headers: withDirectoryHeaders({}, directory) })
    if (!res.ok) return { ok: false as const, status: res.status, text: await res.text() }
    const data = await res.json()
    return { ok: true as const, data }
  }

  let url = buildUrl(true)
  let result = await fetchList(url)
  if (
    !result.ok &&
    options?.sessionID &&
    (result.status === 400 || result.status === 404 || result.status === 422)
  ) {
    url = buildUrl(false)
    result = await fetchList(url)
  }
  if (!result.ok) {
    throw new Error(`getPendingQuestions failed: ${result.status} ${result.text}`)
  }
  return normalizePendingQuestionList(result.data)
}

export async function rejectQuestion(requestId: string, directory?: string): Promise<void> {
  const url = `${BASE}/question/${encodeURIComponent(requestId)}/reject`
  const res = await fetch(url, {
    method: 'POST',
    headers: withDirectoryHeaders({}, directory),
  })
  const bodyText = await res.text()
  if (!res.ok) {
    throw new Error(`rejectQuestion failed: ${res.status} ${bodyText}`)
  }
}

export type McpServerStatus = {
  status: 'connected' | 'failed'
  error?: string
}

export type OcSkill = {
  name: string
  description?: string
  location?: string
}

/** GET /mcp — configured MCP servers and their health. */
export async function getMcpStatus(directory?: string): Promise<Record<string, McpServerStatus>> {
  const res = await fetch(`${BASE}/mcp`, { headers: withDirectoryHeaders({}, directory) })
  if (!res.ok) throw new Error(`getMcpStatus failed: ${res.status}`)
  const data = (await res.json()) as unknown
  if (data && typeof data === 'object') return data as Record<string, McpServerStatus>
  return {}
}

/** GET /skill — available skills. */
export async function getSkills(directory?: string): Promise<OcSkill[]> {
  const res = await fetch(`${BASE}/skill`, { headers: withDirectoryHeaders({}, directory) })
  if (!res.ok) throw new Error(`getSkills failed: ${res.status}`)
  const data = (await res.json()) as unknown
  return Array.isArray(data) ? (data as OcSkill[]) : []
}
