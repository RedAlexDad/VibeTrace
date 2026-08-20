import type { OcMessage, ToolPart } from '@/shared/types/opencode'

export function normalizeToolNameLocal(tool: string): string {
  return tool.trim().toLowerCase().replace(/-/g, '_')
}

export function strInput(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim()
  return undefined
}

function isFileMutatingTool(toolName: string): boolean {
  const t = toolName.toLowerCase()
  if (t.includes('write') || t.includes('edit') || t.includes('replace') || t.includes('patch')) {
    return true
  }
  if (t === 'apply_patch' || t.includes('apply_patch')) return true
  return false
}

export function extractPathFromToolInput(input: Record<string, unknown> | undefined): string | null {
  if (!input) return null
  const keys = ['path', 'file_path', 'target_file', 'filepath', 'filePath']
  for (const k of keys) {
    const v = input[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

function collectPathsFromToolPart(part: ToolPart, into: Set<string>) {
  if (!isFileMutatingTool(part.tool)) return
  const p = extractPathFromToolInput(part.state?.input as Record<string, unknown> | undefined)
  if (p) into.add(p)
}

/** Collect write/edit paths across messages (Changes + merged child sessions). */
export function collectMutatedPathsFromMessages(msgs: OcMessage[], into: Set<string>): void {
  for (const m of msgs) {
    for (const part of m.parts) {
      if (part.type === 'tool') collectPathsFromToolPart(part, into)
    }
  }
}

/**
 * Read stats: deduped path list + glob file hits (`meta.count`).
 * grep `meta.count` is usually line matches, not files — excluded from file count.
 */
export function collectReadFileStatsFromMessages(msgs: OcMessage[]): {
  readPathsSorted: string[]
  globFileHits: number
} {
  const paths = new Set<string>()
  let globFileHits = 0
  for (const m of msgs) {
    for (const part of m.parts) {
      if (part.type !== 'tool') continue
      const t = normalizeToolNameLocal(part.tool)
      const meta = part.state?.metadata as Record<string, unknown> | undefined
      const cnt = meta?.count
      if (t === 'glob') {
        if (typeof cnt === 'number' && cnt > 0) {
          globFileHits += cnt
        } else {
          const p = extractPathFromToolInput(
            part.state?.input as Record<string, unknown> | undefined,
          )
          if (p) paths.add(p)
        }
        continue
      }
      if (t === 'grep' || t === 'read' || t === 'read_file' || t === 'list' || t === 'codesearch') {
        const p = extractPathFromToolInput(part.state?.input as Record<string, unknown> | undefined)
        if (p) paths.add(p)
      }
    }
  }
  return { readPathsSorted: [...paths].sort(), globFileHits }
}