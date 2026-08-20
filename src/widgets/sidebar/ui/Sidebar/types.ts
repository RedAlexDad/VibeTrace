import type { OcSession } from '@/shared/types/opencode'

export interface SidebarProps {
  /** Sessions in the selected folder (sorted, filtered). */
  sessionsInFolder: OcSession[]
  selectedDirectory: string
  selectedSessionId: string
  onSelectSession: (id: string) => void
  onCreateSession: () => void | Promise<void>
  creatingSession?: boolean
  /** Calls OpenCode DELETE /session/:id — removes session from UI (server deletes data). */
  onArchiveSession?: (sessionId: string) => void | Promise<void>
  archivingSessionId?: string | null
  apiConnected: boolean
  /** Navigate back to the workspace picker page. */
  onNavigateToWorkspaces: () => void
}

export const SESSION_WIDTH = 240
/** A session is "active" if updated within this window */
export const ACTIVE_SESSION_WINDOW_MS = 30_000
