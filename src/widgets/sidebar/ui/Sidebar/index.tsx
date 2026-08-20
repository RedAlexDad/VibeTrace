import { useEffect, useRef, useState } from 'react'
import { setSessionsCollapsed, setWsCollapsed } from '@/app/store/uiSlice'
import { useAppDispatch, useAppSelector } from '@/app/store/hooks'
import WorkspacePanel from './WorkspacePanel'
import SessionPanel from './SessionPanel'
import SidebarRail from './SidebarRail'
import DirectoryContextMenu from './DirectoryContextMenu'
import { type DirMenu, type SidebarProps } from './types'

export default function Sidebar({
  sessionsInFolder,
  directories,
  recencyMap,
  selectedDirectory,
  onSelectDirectory,
  selectedSessionId,
  onSelectSession,
  onCreateSession,
  creatingSession,
  onArchiveSession,
  archivingSessionId,
  apiConnected,
  onAddDirectory,
  onCloseDirectory,
}: SidebarProps) {
  const wsCollapsed = useAppSelector((s) => s.ui.wsCollapsed)
  const sessionsCollapsed = useAppSelector((s) => s.ui.sessionsCollapsed)
  const dispatch = useAppDispatch()
  const [dirMenu, setDirMenu] = useState<DirMenu | null>(null)
  const dirMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!dirMenu) return
    const onPointer = (e: MouseEvent) => {
      if (!dirMenuRef.current?.contains(e.target as Node)) {
        setDirMenu(null)
      }
    }
    const onScroll = () => setDirMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDirMenu(null)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [dirMenu])

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        flexShrink: 0,
      }}
    >
      {!wsCollapsed ? (
        <WorkspacePanel
          directories={directories}
          recencyMap={recencyMap}
          selectedDirectory={selectedDirectory}
          onSelectDirectory={onSelectDirectory}
          onAddDirectory={onAddDirectory}
          onCloseDirectory={onCloseDirectory}
          onOpenDirMenu={setDirMenu}
        />
      ) : (
        <SidebarRail
          label="Show workspaces"
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
          onExpand={() => dispatch(setWsCollapsed(false))}
        />
      )}

      {!sessionsCollapsed ? (
        <SessionPanel
          sessionsInFolder={sessionsInFolder}
          selectedDirectory={selectedDirectory}
          selectedSessionId={selectedSessionId}
          onSelectSession={onSelectSession}
          onCreateSession={onCreateSession}
          creatingSession={creatingSession}
          onArchiveSession={onArchiveSession}
          archivingSessionId={archivingSessionId}
          apiConnected={apiConnected}
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
      {dirMenu && onCloseDirectory && (
        <DirectoryContextMenu
          ref={dirMenuRef}
          menu={dirMenu}
          onClose={onCloseDirectory}
          onDismiss={() => setDirMenu(null)}
        />
      )}
    </div>
  )
}
