import { useEffect, useMemo, useRef, useState } from 'react'
import type { OcSession } from '../types/opencode'
import { folderDisplayName, groupDirectoriesByParent } from '../utils/sessionFolders'
import { setSessionsCollapsed, setWsCollapsed } from '../store/uiSlice'
import { useAppDispatch, useAppSelector } from '../store/hooks'

interface SidebarProps {
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

const WORKSPACE_WIDTH = 208
const SESSION_WIDTH = 240
/** A session is "active" if updated within this window */
const ACTIVE_SESSION_WINDOW_MS = 30_000
type DirMenu = { x: number; y: number; dir: string }

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
  const [hoverSessionId, setHoverSessionId] = useState<string | null>(null)
  const wsCollapsed = useAppSelector((s) => s.ui.wsCollapsed)
  const sessionsCollapsed = useAppSelector((s) => s.ui.sessionsCollapsed)
  const dispatch = useAppDispatch()
  const [dirMenu, setDirMenu] = useState<DirMenu | null>(null)
  const dirMenuRef = useRef<HTMLDivElement>(null)
  const [sessionQuery, setSessionQuery] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 5000)
    return () => window.clearInterval(id)
  }, [])
  const titleName = useMemo(
    () => folderDisplayName(selectedDirectory),
    [selectedDirectory],
  )
  const filteredSessions = useMemo(() => {
    const q = sessionQuery.trim().toLowerCase()
    if (!q) return sessionsInFolder
    return sessionsInFolder.filter((s) =>
      (s.title || '').toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
    )
  }, [sessionsInFolder, sessionQuery])
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

  /** Collapsed rail button — restores a hidden panel when clicked. */
  const renderRail = (label: string, icon: React.ReactNode, onExpand: () => void) => (
    <div
      style={{
        width: 36,
        height: '100%',
        background: 'var(--color-bg-subtle)',
        borderRight:'1px solid var(--color-border-light)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 10,
        flexShrink: 0,
      }}
    >
      <button
        onClick={onExpand}
        title={label}
        style={{
          width: 30,
          height: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          color: 'var(--color-text-secondary)',
        }}
      >
        {icon}
      </button>
    </div>
  )

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        flexShrink: 0,
      }}
    >
      {!wsCollapsed ? (
        /* Workspace panel: directories grouped under their parent folder */
        <div
          style={{
            width: WORKSPACE_WIDTH,
            background: 'var(--color-bg-subtle)',
            borderRight:'1px solid var(--color-border-light)',
            display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: 48,
            padding: '0 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            borderBottom:'1px solid var(--color-border-light)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Workspaces
          </span>
          {onAddDirectory && (
            <button
              type="button"
              title="Add workspace directory"
              onClick={onAddDirectory}
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                border:'1px solid var(--color-accent-border)',
                background:'linear-gradient(180deg, var(--color-accent-softer) 0%, var(--color-accent-soft) 100%)',
                cursor: 'pointer',
                color: 'var(--color-accent-deep)',
                fontSize: 15,
                fontWeight: 600,
                lineHeight: '18px',
                flexShrink: 0,
              }}
            >
              +
            </button>
          )}
          <button
            type="button"
            title="Hide workspaces"
            onClick={() => dispatch(setWsCollapsed(true))}
            style={{
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              color: 'var(--color-text-tertiary)',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0 8px' }}>
          {groupDirectoriesByParent(directories, recencyMap).map((group) => {
            const groupLabel = group.parent ? folderDisplayName(group.parent) : 'Other'
            return (
              <div key={group.parent || '__root__'} style={{ marginBottom: 6 }}>
                <div
                  style={{
                    padding: '4px 12px 2px',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 0.3,
                    textTransform: 'uppercase',
                    color: 'var(--color-text-tertiary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={group.parent}
                >
                  {groupLabel}
                </div>
                {group.dirs.map((dir) => {
                  const active = dir === selectedDirectory
                  const name = folderDisplayName(dir)
                  return (
                    <button
                      key={dir || '__root__'}
                      type="button"
                      title={dir}
                      onClick={() => onSelectDirectory(dir)}
                      onContextMenu={(e) => {
                        if (!onCloseDirectory) return
                        e.preventDefault()
                        setDirMenu({ x: e.clientX, y: e.clientY, dir })
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: 'calc(100% - 12px)',
                        margin: '0 6px',
                        minHeight: 30,
                        padding: '4px 8px',
                        borderRadius: 7,
                        border: active ? '1px solid var(--color-accent)' : '1px solid transparent',
                        background: active ? 'var(--color-accent-soft)' : 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 12,
                        fontWeight: active ? 600 : 400,
                        color: active ? 'var(--color-accent-deep)' : 'var(--color-text-primary)',
                        lineHeight: 1.2,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: active ? 'var(--color-accent)' : 'var(--color-gray-200)',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
          {directories.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>
              No workspaces yet. Use &quot;+&quot; to add a directory.
            </div>
          )}
        </div>
        </div>
      ) : (
        renderRail(
          'Show workspaces',
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5l7 7-7 7" />
          </svg>,
          () => dispatch(setWsCollapsed(false)),
        )
      )}

      {!sessionsCollapsed ? (
      <div
        style={{
          width: SESSION_WIDTH,
          height: '100%',
          background: 'var(--color-bg-white)',
          borderRight:'1px solid var(--color-border-light)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            height: 48,
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom:'1px solid var(--color-border-light)',
            minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span
              title={selectedDirectory || 'Active workspace'}
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {titleName}
            </span>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: apiConnected ? 'var(--color-success)' : 'var(--color-error)',
                flexShrink: 0,
              }}
              title={apiConnected ? 'OpenCode connected' : 'Not connected'}
            />
          </div>
          <button
            onClick={() => dispatch(setSessionsCollapsed(true))}
            style={{
              width: 24,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              flexShrink: 0,
            }}
            title="Hide sessions"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2">
              <path d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '8px 12px' }}>
          <button
            type="button"
            disabled={creatingSession}
            onClick={() => void onCreateSession()}
            style={{
              width: '100%',
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: creatingSession ? 'var(--color-bg-disabled)' : 'var(--color-accent)',
              color: 'var(--color-on-accent)',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: creatingSession ? 'wait' : 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {creatingSession ? 'Creating…' : 'New session'}
          </button>
        </div>

        <div style={{ padding: '0 12px 6px' }}>
          <input
            type="text"
            value={sessionQuery}
            onChange={(e) => setSessionQuery(e.target.value)}
            placeholder="Search sessions…"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              height: 28,
              padding: '0 10px',
              fontSize: 11,
              borderRadius: 6,
              border:'1px solid var(--color-border)',
              background: 'var(--color-bg-white)',
              color: 'var(--color-text-primary)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '4px 0',
          }}
        >
          {filteredSessions.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
              {sessionQuery.trim()
                ? 'No sessions match your search.'
                : 'No sessions in this folder yet. Use &quot;New session&quot; to start.'}
            </div>
          ) : (
            filteredSessions.map((session) => (
              <div
                key={session.id}
                onMouseEnter={() => setHoverSessionId(session.id)}
                onMouseLeave={() => setHoverSessionId(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 8px 4px 12px',
                  background: session.id === selectedSessionId ? 'var(--color-accent-soft)' : 'transparent',
                  borderRadius: 6,
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelectSession(session.id)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '4px 0',
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div
                    title={
                      session.id === selectedSessionId
                        ? 'Active session'
                        : nowMs - session.time.updated <= ACTIVE_SESSION_WINDOW_MS
                          ? 'Running'
                          : undefined
                    }
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background:
                        session.id === selectedSessionId
                          ? 'var(--color-accent)'
                          : nowMs - session.time.updated <= ACTIVE_SESSION_WINDOW_MS
                            ? 'var(--color-success)'
                            : 'var(--color-gray-200)',
                      flexShrink: 0,
                      ...(nowMs - session.time.updated <= ACTIVE_SESSION_WINDOW_MS && {
                        boxShadow: `0 0 0 0 ${session.id === selectedSessionId ? 'var(--color-accent)' : 'var(--color-success)'}`,
                        animation: 'actionFlowRunningPulse 1.2s ease-in-out infinite',
                      }),
                    }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--color-text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {session.title || 'Untitled'}
                  </span>
                </button>
                {onArchiveSession && (
                  <button
                    type="button"
                    title="Delete session (removes from server)"
                    disabled={archivingSessionId === session.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      void onArchiveSession(session.id)
                    }}
                    style={{
                      flexShrink: 0,
                      width: 28,
                      height: 28,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 6,
                      cursor: archivingSessionId === session.id ? 'wait' : 'pointer',
                      opacity: hoverSessionId === session.id ? 1 : 0.35,
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {archivingSessionId === session.id ? (
                      <span style={{ fontSize: 11 }}>…</span>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 8v13H3V8M1 3h22v5H1V3zM10 12h4" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      ) : (
        renderRail(
          'Show sessions',
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5l7 7-7 7" />
          </svg>,
          () => dispatch(setSessionsCollapsed(false)),
        )
      )}
      {dirMenu && onCloseDirectory && (
        <div
          ref={dirMenuRef}
          style={{
            position: 'fixed',
            top: dirMenu.y,
            left: dirMenu.x,
            zIndex: 2000,
            minWidth: 148,
            background: 'var(--color-bg-white)',
            border:'1px solid var(--color-border-light)',
            borderRadius: 8,
            boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
            padding: 4,
          }}
        >
          <button
            type="button"
            onClick={() => {
              onCloseDirectory(dirMenu.dir)
              setDirMenu(null)
            }}
            style={{
              width: '100%',
              height: 30,
              border: 'none',
              borderRadius: 6,
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              padding: '0 10px',
              fontSize: 12,
              color: 'var(--color-error-text)',
            }}
          >
            Close Workspace
          </button>
        </div>
      )}
    </div>
  )
}
