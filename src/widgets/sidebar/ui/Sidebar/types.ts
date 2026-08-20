import type { OcSession } from '@/shared/types/opencode'

export interface SidebarProps {
  /** Sessions in the selected folder (sorted, filtered). */
  sessionsInFolder: OcSession[]
  directories: string[]
  /** Directory → most recent session update time, for recency ordering. */
  recencyMap?: Map<string, number>
  selectedDirectory: string
  onSelectDirectory: (dir: string) => void | Promise<void>
  selectedSessionId: string
  onSelectSession: (id: string) => void
  onCreateSession: () => void | Promise<void>
  creatingSession?: boolean
  /** Calls OpenCode DELETE /session/:id — removes session from UI (server deletes data). */
  onArchiveSession?: (sessionId: string) => void | Promise<void>
  archivingSessionId?: string | null
  apiConnected: boolean
  onAddDirectory?: () => void
  onCloseDirectory?: (dir: string) => void
}

export const WORKSPACE_WIDTH = 208
export const SESSION_WIDTH = 240
/** A session is "active" if updated within this window */
export const ACTIVE_SESSION_WINDOW_MS = 30_000
export type DirMenu = { x: number; y: number; dir: string }