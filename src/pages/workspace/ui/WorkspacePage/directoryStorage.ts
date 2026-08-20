import { STORAGE_KEYS } from '@/shared/config/storageKeys'
import { normalizeSessionDirectory } from '@/entities/workspace/lib/sessionFolders'

export function parseEnvDirectorySeeds(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  return raw
    .split(/[;\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function directoryKey(dir: string | undefined): string {
  const n = normalizeSessionDirectory(dir)
  if (!n) return ''
  return /^[A-Za-z]:\//.test(n) ? n.toLowerCase() : n
}

export function sameDirectory(a: string | undefined, b: string | undefined): boolean {
  return directoryKey(a) === directoryKey(b)
}

export function loadManualDirectories(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.manualDirectories)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data
      .map((v) => (typeof v === 'string' ? normalizeSessionDirectory(v) : ''))
      .filter(Boolean)
  } catch {
    return []
  }
}

export function loadClosedDirectories(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.closedDirectories)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data
      .map((v) => (typeof v === 'string' ? normalizeSessionDirectory(v) : ''))
      .filter(Boolean)
  } catch {
    return []
  }
}

export function promptDirectoryPath(seed: string): string | null {
  const message =
    'Due to browser security restrictions, web pages cannot directly read folder paths on your computer. If you want to create or load a local workspace, please copy the folder absolute path and paste it into the input below.'
  const raw = window.prompt(message, seed)
  if (!raw) return null
  return normalizeSessionDirectory(raw)
}