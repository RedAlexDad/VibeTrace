import { folderDisplayName, groupDirectoriesByParent } from '@/entities/workspace/lib/sessionFolders'
import { setWsCollapsed, toggleGroupCollapsed } from '@/app/store/uiSlice'
import { useAppDispatch, useAppSelector } from '@/app/store/hooks'
import { WORKSPACE_WIDTH, type DirMenu } from './types'

export default function WorkspacePanel({
  directories,
  recencyMap,
  selectedDirectory,
  onSelectDirectory,
  onAddDirectory,
  onCloseDirectory,
  onOpenDirMenu,
}: {
  directories: string[]
  recencyMap?: Map<string, number>
  selectedDirectory: string
  onSelectDirectory: (dir: string) => void | Promise<void>
  onAddDirectory?: () => void
  onCloseDirectory?: (dir: string) => void
  onOpenDirMenu: (menu: DirMenu) => void
}) {
  const collapsedGroups = useAppSelector((s) => s.ui.collapsedGroups)
  const dispatch = useAppDispatch()

  return (
    <div
      style={{
        width: WORKSPACE_WIDTH,
        background: 'var(--color-bg-subtle)',
        borderRight: '1px solid var(--color-border-light)',
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
          borderBottom: '1px solid var(--color-border-light)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
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
              border: '1px solid var(--color-accent-border)',
              background:
                'linear-gradient(180deg, var(--color-accent-softer) 0%, var(--color-accent-soft) 100%)',
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
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0 8px' }}>
        {groupDirectoriesByParent(directories, recencyMap).map((group) => {
          const groupLabel = group.parent ? folderDisplayName(group.parent) : 'Other'
          const groupKey = group.parent || '__root__'
          const groupCollapsed = collapsedGroups.includes(groupKey)
          return (
            <div key={groupKey} style={{ marginBottom: 6 }}>
              <button
                type="button"
                onClick={() => dispatch(toggleGroupCollapsed(groupKey))}
                title={group.parent}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px 2px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-text-tertiary)"
                  strokeWidth="2"
                  style={{
                    transform: groupCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s ease',
                    flexShrink: 0,
                  }}
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 0.3,
                    textTransform: 'uppercase',
                    color: 'var(--color-text-tertiary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {groupLabel}
                </span>
              </button>
              {!groupCollapsed &&
                group.dirs.map((dir) => {
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
                        onOpenDirMenu({ x: e.clientX, y: e.clientY, dir })
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
                        border: active
                          ? '1px solid var(--color-accent)'
                          : '1px solid transparent',
                        background: active ? 'var(--color-accent-soft)' : 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 12,
                        fontWeight: active ? 600 : 400,
                        color: active
                          ? 'var(--color-accent-deep)'
                          : 'var(--color-text-primary)',
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
                    </button>
                  )
                })}
            </div>
          )
        })}
        {directories.length === 0 && (
          <div
            style={{
              padding: '8px 12px',
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              lineHeight: 1.4,
            }}
          >
            No workspaces yet. Use &quot;+&quot; to add a directory.
          </div>
        )}
      </div>
    </div>
  )
}