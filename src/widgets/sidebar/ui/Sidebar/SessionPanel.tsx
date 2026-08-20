import { useEffect, useMemo, useState } from 'react'
import type { OcSession } from '@/shared/types/opencode'
import { folderDisplayName } from '@/entities/workspace/lib/sessionFolders'
import { setSessionsCollapsed } from '@/app/store/uiSlice'
import { useAppDispatch } from '@/app/store/hooks'
import { ACTIVE_SESSION_WINDOW_MS, SESSION_WIDTH } from './types'

export default function SessionPanel({
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
}: {
  sessionsInFolder: OcSession[]
  selectedDirectory: string
  selectedSessionId: string
  onSelectSession: (id: string) => void
  onCreateSession: () => void | Promise<void>
  creatingSession?: boolean
  onArchiveSession?: (sessionId: string) => void | Promise<void>
  apiConnected: boolean
  onNavigateToWorkspaces: () => void
  onRenameSession?: (sessionId: string, title: string) => void | Promise<void>
}) {
  const dispatch = useAppDispatch()
  const [sessionQuery, setSessionQuery] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null)
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 5000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    if (!ctxMenu) return
    const onPointer = (e: MouseEvent) => {
      const t = e.target
      if (!(t instanceof Element) || !t.closest('[data-session-ctx-menu]')) setCtxMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(null)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [ctxMenu])
  const titleName = useMemo(() => folderDisplayName(selectedDirectory), [selectedDirectory])
  const filteredSessions = useMemo(() => {
    const q = sessionQuery.trim().toLowerCase()
    if (!q) return sessionsInFolder
    return sessionsInFolder.filter(
      (s) => (s.title || '').toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
    )
  }, [sessionsInFolder, sessionQuery])

  return (
    <div
      style={{
        width: SESSION_WIDTH,
        height: '100%',
        background: 'var(--color-bg-white)',
        borderRight: '1px solid var(--color-border-light)',
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
          borderBottom: '1px solid var(--color-border-light)',
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <button
            type="button"
            onClick={onNavigateToWorkspaces}
            title="Choose workspace"
            aria-label="Choose workspace"
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
              padding: 0,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
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
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-tertiary)"
            strokeWidth="2"
          >
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
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
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
            border: '1px solid var(--color-border)',
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
          <div
            style={{
              padding: '12px 14px',
              fontSize: 12,
              color: 'var(--color-text-tertiary)',
              lineHeight: 1.5,
            }}
          >
            {sessionQuery.trim()
              ? 'No sessions match your search.'
              : 'No sessions in this folder yet. Use "New session" to start.'}
          </div>
        ) : (
          filteredSessions.map((session) => (
            <div
              key={session.id}
              onContextMenu={(e) => {
                if (!onArchiveSession) return
                e.preventDefault()
                setCtxMenu({ x: e.clientX, y: e.clientY, sessionId: session.id })
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px 4px 12px',
                background:
                  session.id === selectedSessionId ? 'var(--color-accent-soft)' : 'transparent',
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
            </div>
          ))
        )}
      </div>

      {ctxMenu && (
        <div
          data-session-ctx-menu="1"
          style={{
            position: 'fixed',
            top: ctxMenu.y,
            left: ctxMenu.x,
            zIndex: 2000,
            minWidth: 148,
            background: 'var(--color-bg-white)',
            border: '1px solid var(--color-border-light)',
            borderRadius: 8,
            boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
            padding: 4,
          }}
        >
          <button
            type="button"
            onClick={() => {
              const id = ctxMenu.sessionId
              const s = sessionsInFolder.find((x) => x.id === id)
              const current = s?.title || ''
              const next = window.prompt('Rename session', current)
              setCtxMenu(null)
              if (next === null || next.trim() === '' || next === current) return
              if (onRenameSession) void onRenameSession(id, next.trim())
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
              color: 'var(--color-text-primary)',
            }}
          >
            Rename Session
          </button>
          <button
            type="button"
            onClick={() => {
              const id = ctxMenu.sessionId
              setCtxMenu(null)
              if (onArchiveSession) void onArchiveSession(id)
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
            Delete Session
          </button>
        </div>
      )}
    </div>
  )
}
