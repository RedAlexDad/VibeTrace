import { setSessionsCollapsed } from '@/app/store/uiSlice'
import { useAppDispatch, useAppSelector } from '@/app/store/hooks'
import SessionPanel from './SessionPanel'
import SidebarRail from './SidebarRail'
import { type SidebarProps } from './types'

export default function Sidebar({
  sessionsInFolder,
  selectedDirectory,
  selectedSessionId,
  onSelectSession,
  onCreateSession,
  creatingSession,
  onArchiveSession,
  apiConnected,
  onNavigateToWorkspaces,
  onRenameSession,
}: SidebarProps) {
  const sessionsCollapsed = useAppSelector((s) => s.ui.sessionsCollapsed)
  const dispatch = useAppDispatch()

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        flexShrink: 0,
      }}
    >
      {!sessionsCollapsed ? (
        <SessionPanel
          sessionsInFolder={sessionsInFolder}
          selectedDirectory={selectedDirectory}
          selectedSessionId={selectedSessionId}
          onSelectSession={onSelectSession}
          onCreateSession={onCreateSession}
          creatingSession={creatingSession}
          onArchiveSession={onArchiveSession}
          apiConnected={apiConnected}
          onNavigateToWorkspaces={onNavigateToWorkspaces}
          onRenameSession={onRenameSession}
        />
      ) : (
        <SidebarRail
          label="Show sessions"
          icon={
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
          }
          onExpand={() => dispatch(setSessionsCollapsed(false))}
        />
      )}
    </div>
  )
}
