/**
 * OpenCode HTTP base URL (must match the address printed by `opencode serve` in your terminal).
 * - Easiest fix: add `.env.local` at the repo root with `VITE_OPENCODE_BASE=http://127.0.0.1:61830` (swap port), then restart `npm run dev`
 * - Or change the default URL returned below
 */
function resolveOpencodeBase(): string {
  const raw = import.meta.env.VITE_OPENCODE_BASE
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim().replace(/\/$/, '')
  }
  return 'http://127.0.0.1:4096'
}

export const BASE = resolveOpencodeBase()

/**
 * OpenCode `POST /session/:id/message` expects `model` as `{ providerID, modelID }`, not a `provider/model` string.
 */
export function parseModelRefToBody(
  ref: string,
): { providerID: string; modelID: string } | undefined {
  const t = ref.trim()
  const i = t.indexOf('/')
  if (i <= 0 || i >= t.length - 1) return undefined
  const providerID = t.slice(0, i).trim()
  const modelID = t.slice(i + 1).trim()
  if (!providerID || !modelID) return undefined
  return { providerID, modelID }
}

/**
 * Matches OpenCode server auth docs: when `OPENCODE_SERVER_PASSWORD` is set every HTTP/SSE hop needs Basic auth.
 */
export function basicAuthHeader(): Record<string, string> {
  const pwd = import.meta.env.VITE_OPENCODE_SERVER_PASSWORD
  if (typeof pwd !== 'string' || !pwd.trim()) return {}
  const user =
    typeof import.meta.env.VITE_OPENCODE_SERVER_USERNAME === 'string' &&
    import.meta.env.VITE_OPENCODE_SERVER_USERNAME.trim()
      ? import.meta.env.VITE_OPENCODE_SERVER_USERNAME.trim()
      : 'opencode'
  const raw = `${user}:${pwd}`
  const bytes = new TextEncoder().encode(raw)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return { Authorization: `Basic ${btoa(bin)}` }
}

export function withDirectoryHeaders(
  base: Record<string, string>,
  directory?: string,
): Record<string, string> {
  const out = { ...base, ...basicAuthHeader() }
  if (directory) out['x-opencode-directory'] = directory
  return out
}

export function normalizeDirectoryLike(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t) return null
  return t.replace(/\\/g, '/').replace(/\/+$/, '')
}

export function extractProjectDirectory(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null
  const obj = item as Record<string, unknown>
  const candidates = [
    obj.worktree,
    obj.directory,
    obj.path,
    obj.root,
    obj.cwd,
    (obj.path as Record<string, unknown> | undefined)?.directory,
  ]
  for (const c of candidates) {
    const n = normalizeDirectoryLike(c)
    if (n) return n
  }
  return null
}
