import type { OcSession } from '@/shared/types/opencode'
import { getSessions } from '@/shared/api/opencodeApi'

export function mergeSessionsById(lists: OcSession[][]): OcSession[] {
  const map = new Map<string, OcSession>()
  for (const list of lists) {
    for (const s of list) {
      const cur = map.get(s.id)
      if (!cur || s.time.updated >= cur.time.updated) {
        map.set(s.id, s)
      }
    }
  }
  return [...map.values()]
}

export async function fetchSessionsAcrossDirectories(
  seedDirs: Array<string | undefined>,
): Promise<OcSession[]> {
  const dedup = Array.from(
    new Set(
      seedDirs.map((d) => (typeof d === 'string' ? d.trim() : '')).filter((d) => d.length > 0),
    ),
  )
  const jobs = dedup.map(async (dir) => {
    try {
      return await getSessions({ directory: dir })
    } catch {
      return [] as OcSession[]
    }
  })
  const lists = await Promise.all(jobs)
  return mergeSessionsById(lists)
}
