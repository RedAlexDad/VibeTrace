import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { OcSession } from '@/shared/types/opencode'
import {
  getCurrentWorkspaceDirectory,
  getProjectDirectories,
  getSessions,
} from '@/shared/api/opencodeApi'
import {
  folderDisplayName,
  groupDirectoriesByParent,
  lastActivityByDirectory,
  normalizeSessionDirectory,
  uniqueDirectoriesFromSessions,
} from '@/entities/workspace/lib/sessionFolders'
import {
  loadClosedDirectories,
  loadManualDirectories,
} from '@/pages/workspace/ui/WorkspacePage/directoryStorage'
import { STORAGE_KEYS } from '@/shared/config/storageKeys'

export default function WorkspacesPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<OcSession[]>([])
  const [projectDirectories, setProjectDirectories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const manualDirectories = useMemo(() => loadManualDirectories(), [])
  const [closedDirectories, setClosedDirectories] = useState<string[]>(() =>
    loadClosedDirectories(),
  )
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; dir: string } | null>(null)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.closedDirectories, JSON.stringify(closedDirectories))
  }, [closedDirectories])

  useEffect(() => {
    if (!ctxMenu) return
    const onPointer = (e: MouseEvent) => {
      const t = e.target
      if (!(t instanceof Element) || !t.closest('[data-workspace-ctx-menu]')) setCtxMenu(null)
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

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [base, discovered, current] = await Promise.all([
          getSessions(),
          getProjectDirectories().catch(() => [] as string[]),
          getCurrentWorkspaceDirectory().catch(() => null),
        ])
        const mergedDiscovered = Array.from(new Set([...discovered, ...(current ? [current] : [])]))
        if (!cancelled) {
          setSessions(base)
          setProjectDirectories(mergedDiscovered.map((d) => normalizeSessionDirectory(d)))
        }
      } catch {
        /* connection error — show empty state */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const directories = useMemo(() => {
    const mergedRaw = [
      ...uniqueDirectoriesFromSessions(sessions),
      ...projectDirectories,
      ...manualDirectories,
    ]
    const map = new Map<string, string>()
    for (const dir of mergedRaw) {
      if (!dir || map.has(dir)) continue
      map.set(dir, normalizeSessionDirectory(dir))
    }
    return [...map.values()]
      .filter((d) => d !== 'Unknown' && d !== '' && !closedDirectories.includes(d))
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [sessions, projectDirectories, manualDirectories, closedDirectories])

  const recencyMap = useMemo(() => lastActivityByDirectory(sessions), [sessions])

  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg-base)',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          width: 'min(720px, 92vw)',
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-bg-white)',
          border: '1px solid var(--color-border-light)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: 48,
            padding: '0 18px',
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid var(--color-border-light)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Workspaces
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {loading ? 'Loading…' : `${directories.length} available`}
          </span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {loading ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--color-text-tertiary)',
                fontSize: 12,
              }}
            >
              Loading…
            </div>
          ) : directories.length === 0 ? (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: 'var(--color-text-tertiary)',
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              No workspaces found. Open the app in the directory you want to work in and refresh.
            </div>
          ) : (
            groupDirectoriesByParent(directories, recencyMap).map((group) => {
              const groupLabel = group.parent ? folderDisplayName(group.parent) : 'Other'
              return (
                <div key={group.parent || '__root__'} style={{ marginBottom: 10 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 0.3,
                      textTransform: 'uppercase',
                      color: 'var(--color-text-tertiary)',
                      padding: '6px 8px',
                    }}
                  >
                    {groupLabel}
                  </div>
                  {group.dirs.map((dir) => {
                    const name = folderDisplayName(dir)
                    return (
                      <button
                        key={dir}
                        type="button"
                        title={dir}
                        onClick={() => navigate(`/?dir=${encodeURIComponent(dir)}`)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setCtxMenu({ x: e.clientX, y: e.clientY, dir })
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          width: '100%',
                          minHeight: 44,
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--color-border-light)',
                          background: 'var(--color-bg-white)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--color-text-primary)',
                          lineHeight: 1.3,
                          transition: 'background 0.15s ease, border-color 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--color-bg-soft)'
                          e.currentTarget.style.borderColor = 'var(--color-border-strong)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'var(--color-bg-white)'
                          e.currentTarget.style.borderColor = 'var(--color-border-light)'
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--color-accent)',
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {name}
                        </span>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--color-text-tertiary)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ flexShrink: 0 }}
                        >
                          <path d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      </div>

      {ctxMenu && (
        <div
          data-workspace-ctx-menu="1"
          style={{
            position: 'fixed',
            top: ctxMenu.y,
            left: ctxMenu.x,
            zIndex: 2000,
            minWidth: 168,
            background: 'var(--color-bg-white)',
            border: '1px solid var(--color-border-light)',
            borderRadius: 8,
            boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
            padding: 4,
          }}
        >
          <button
            type="button"
            onClick={() => navigate(`/?dir=${encodeURIComponent(ctxMenu.dir)}`)}
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
            Open
          </button>
          <button
            type="button"
            onClick={() => {
              setClosedDirectories((prev) =>
                prev.includes(ctxMenu.dir) ? prev : [...prev, ctxMenu.dir],
              )
              setCtxMenu(null)
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
