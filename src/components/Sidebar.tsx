import { useEffect, useMemo, useRef, useState } from 'react'
import type { OcSession } from '../types/opencode'
import { folderDisplayName } from '../utils/sessionFolders'

interface SidebarProps {
  /** Sessions in the selected folder (sorted, filtered). */
  sessionsInFolder: OcSession[]
  directories: string[]
  selectedDirectory: string
  onSelectDirectory: (dir: string) => void | Promise<void>
  selectedSessionId: string
  onSelectSession: (id: string) => void
  onCreateSession: () => void | Promise<void>
  creatingSession?: boolean
  /** Calls OpenCode DELETE /session/:id — removes session from UI (server deletes data). */
  onArchiveSession?: (sessionId: string) => void | Promise<void>
  archivingSessionId?: string | null
  collapsed: boolean
  onToggle: () => void
  apiConnected: boolean
  onAddDirectory?: () => void
  onCloseDirectory?: (dir: string) => void
}

const RAIL_WIDTH = 44
type DirMenu = { x: number; y: number; dir: string }

export default function Sidebar({
  sessionsInFolder,
  directories,
  selectedDirectory,
  onSelectDirectory,
  selectedSessionId,
  onSelectSession,
  onCreateSession,
  creatingSession,
  onArchiveSession,
  archivingSessionId,
  collapsed,
  onToggle,
  apiConnected,
  onAddDirectory,
  onCloseDirectory,
}: SidebarProps) {
  const [hoverSessionId, setHoverSessionId] = useState<string | null>(null)
  const [dirMenu, setDirMenu] = useState<DirMenu | null>(null)
  const dirMenuRef = useRef<HTMLDivElement>(null)
  const titleName = useMemo(
    () => folderDisplayName(selectedDirectory),
    [selectedDirectory],
  )
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

  if (collapsed) {
    return (
      <div
        style={{
          width: 48,
          height: '100%',
          background: 'var(--color-bg-white)',
          borderRight:'1px solid var(--color-border-light)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 12,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onToggle}
          style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
          title="Expand sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        flexShrink: 0,
      }}
    >
      {/* Folder rail */}
      <div
        style={{
          width: RAIL_WIDTH,
          background: 'var(--color-bg-subtle)',
          borderRight:'1px solid var(--color-border-light)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 8,
          paddingBottom: 8,
          gap: 6,
          overflowY: 'auto',
        }}
      >
        {onAddDirectory && (
          <button
            type="button"
            title="Add workspace directory"
            onClick={onAddDirectory}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border:'1px solid var(--color-accent-border)',
              background:'linear-gradient(180deg, var(--color-accent-softer) 0%, var(--color-accent-soft) 100%)',
              cursor: 'pointer',
              color: 'var(--color-accent-deep)',
              fontSize: 18,
              fontWeight: 500,
              lineHeight: '28px',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75)',
            }}
          >
            +
          </button>
        )}
        {directories.map((dir) => {
          const active = dir === selectedDirectory
          const label = folderDisplayName(dir).slice(0, 2)
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
                width: 32,
                minHeight: 32,
                padding: '4px 2px',
                borderRadius: 8,
                border: active ? '1px solid var(--color-accent)' : '1px solid transparent',
                background: active ? 'var(--color-accent-soft)' : 'transparent',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                color: active ? 'var(--color-accent-deep)' : 'var(--color-text-secondary)',
                lineHeight: 1.15,
                wordBreak: 'break-all',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Session list */}
      <div
        style={{
          width: 240,
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
            onClick={onToggle}
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
            title="Collapse sidebar"
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

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '4px 0',
          }}
        >
          {sessionsInFolder.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
              No sessions in this folder yet. Use &quot;New session&quot; to start.
            </div>
          ) : (
            sessionsInFolder.map((session) => (
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
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: session.id === selectedSessionId ? 'var(--color-accent)' : 'var(--color-gray-200)',
                      flexShrink: 0,
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
