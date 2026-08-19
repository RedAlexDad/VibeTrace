/** Same normalization as lists, grouping, and OpenCode directory headers */
export function normalizeSessionDirectory(dir: string | undefined): string {
  if (!dir || dir === 'Unknown') return ''
  return dir.replace(/\\/g, '/').replace(/\/+$/, '')
}

export function folderDisplayName(normalizedDir: string): string {
  if (!normalizedDir) return 'Current workspace'
  const parts = normalizedDir.split('/').filter(Boolean)
  return parts[parts.length - 1] || normalizedDir
}

export function uniqueDirectoriesFromSessions(sessions: { directory?: string }[]): string[] {
  const set = new Set<string>()
  for (const s of sessions) {
    set.add(normalizeSessionDirectory(s.directory))
  }
  return [...set].sort((a, b) => folderDisplayName(a).localeCompare(folderDisplayName(b), 'en'))
}

/** Parent directory path (everything but the last segment), '' for root-ish paths */
export function parentFolderPath(dir: string): string {
  const parts = normalizeSessionDirectory(dir).split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return '/' + parts.slice(0, -1).join('/')
}

export type DirectoryGroup = { parent: string; dirs: string[] }

/** Most recent session update per directory — used to order workspaces by recency. */
export function lastActivityByDirectory(
  sessions: { directory?: string; time: { updated: number } }[],
): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of sessions) {
    const d = normalizeSessionDirectory(s.directory)
    if (!d) continue
    const prev = map.get(d) ?? 0
    if (s.time.updated > prev) map.set(d, s.time.updated)
  }
  return map
}

/** Group workspace directories under their parent folder, most-recent activity first. */
export function groupDirectoriesByParent(
  dirs: string[],
  recencyMap?: Map<string, number>,
): DirectoryGroup[] {
  const ts = (d: string) => recencyMap?.get(d) ?? 0
  const byRecency = (a: string, b: string) => ts(b) - ts(a)
  const map = new Map<string, string[]>()
  for (const d of dirs) {
    const parent = parentFolderPath(d)
    const arr = map.get(parent) ?? []
    arr.push(d)
    map.set(parent, arr)
  }
  return [...map.entries()]
    .map(([parent, list]) => ({
      parent,
      dirs: list.sort(
        (a, b) => byRecency(a, b) || folderDisplayName(a).localeCompare(folderDisplayName(b), 'en'),
      ),
    }))
    .sort((a, b) => {
      const aMax = Math.max(0, ...a.dirs.map(ts))
      const bMax = Math.max(0, ...b.dirs.map(ts))
      if (bMax !== aMax) return bMax - aMax
      const an = a.parent ? folderDisplayName(a.parent) : '~Other'
      const bn = b.parent ? folderDisplayName(b.parent) : '~Other'
      return an.localeCompare(bn, 'en')
    })
}
