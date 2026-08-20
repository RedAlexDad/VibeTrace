import { useLayoutEffect, useRef, useState } from 'react'
import type { CanonicalTodo } from '@/entities/todo/lib/todoRegistry'
import Chevron from './Chevron'
import TodoItem from './TodoItem'
import { sectionHeaderLabelStyle, type TodoPanelProps } from './types'

export default function TodoPanel({
  latestActive,
  archivedCompleted,
  latestTodowriteBatchProgress,
  highlightTodoIds,
  onTodoClick,
  listScrollRef,
  todoPanelRevealGeneration = 0,
}: TodoPanelProps) {
  const [panelExpanded, setPanelExpanded] = useState(false)
  /** Open work (pending + in_progress) */
  const [openSectionExpanded, setOpenSectionExpanded] = useState(true)
  /** Completed items still shown in the active list */
  const [doneOnListExpanded, setDoneOnListExpanded] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState(false)

  const latestActiveRef = useRef(latestActive)
  const archivedRef = useRef(archivedCompleted)
  const highlightRef = useRef(highlightTodoIds)
  latestActiveRef.current = latestActive
  archivedRef.current = archivedCompleted
  highlightRef.current = highlightTodoIds

  const openTodos = latestActive.filter((t) => t.status !== 'completed')
  const doneOnList = latestActive.filter((t) => t.status === 'completed')

  /** Header chips: empty list / in progress / all done */
  const panelStatusLabel: 'None' | 'In progress' | 'All done' =
    latestActive.length === 0 ? 'None' : openTodos.length > 0 ? 'In progress' : 'All done'

  const showBatchRatio = Boolean(
    latestTodowriteBatchProgress?.ongoing && latestTodowriteBatchProgress.total > 0,
  )

  // React only to subtask-selection signals so routine todo refreshes don't reset collapse state
  useLayoutEffect(() => {
    if (todoPanelRevealGeneration <= 0) return

    setPanelExpanded(true)

    const la = latestActiveRef.current
    const arc = archivedRef.current
    const ids = highlightRef.current
    const hasHighlight = Boolean(ids && ids.size > 0)
    let hitOpen = false
    let hitDoneOnList = false
    let hitHistory = false
    if (ids && ids.size > 0) {
      for (const id of ids) {
        if (la.some((t) => t.id === id && t.status !== 'completed')) hitOpen = true
        if (la.some((t) => t.id === id && t.status === 'completed')) hitDoneOnList = true
        if (arc.some((t) => t.id === id)) hitHistory = true
      }
    }

    if (!hasHighlight) {
      setOpenSectionExpanded(true)
      setDoneOnListExpanded(false)
      setHistoryExpanded(false)
      return
    }

    setOpenSectionExpanded(hitOpen)
    setDoneOnListExpanded(hitDoneOnList)
    setHistoryExpanded(hitHistory)

    if (!hitOpen && !hitDoneOnList && !hitHistory) {
      setOpenSectionExpanded(true)
      setDoneOnListExpanded(false)
      setHistoryExpanded(false)
    }
  }, [todoPanelRevealGeneration])

  if (latestActive.length === 0 && archivedCompleted.length === 0) return null

  const toggleMainPanel = () => {
    setPanelExpanded((prev) => {
      const next = !prev
      if (next) {
        setOpenSectionExpanded(true)
        setDoneOnListExpanded(false)
        setHistoryExpanded(false)
      }
      return next
    })
  }

  const handleTodoPick = (todo: CanonicalTodo) => {
    setPanelExpanded(true)
    const inHistory = archivedCompleted.some((t) => t.id === todo.id)
    if (inHistory) {
      setHistoryExpanded(true)
      setOpenSectionExpanded(false)
      setDoneOnListExpanded(false)
    } else if (todo.status === 'completed') {
      setDoneOnListExpanded(true)
      setOpenSectionExpanded(false)
      setHistoryExpanded(false)
    } else {
      setOpenSectionExpanded(true)
      setDoneOnListExpanded(false)
      setHistoryExpanded(false)
    }
    onTodoClick?.(todo)
  }

  return (
    <div
      style={{
        maxWidth: '100%',
        margin: '0 16px',
        background: 'var(--color-bg-white)',
        border: '1px solid var(--color-border-light)',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={toggleMainPanel}
        style={{
          width: '100%',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            minWidth: 0,
            textAlign: 'left',
            flex: 1,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-secondary)"
            strokeWidth="2"
            style={{ flexShrink: 0 }}
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              flexShrink: 0,
            }}
          >
            Todos
          </span>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 400,
              color: 'var(--color-text-tertiary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {panelStatusLabel}
          </span>
        </div>
        <Chevron open={panelExpanded} />
      </button>

      {panelExpanded && (
        <div
          ref={listScrollRef}
          style={{
            padding: '0 12px 8px',
            maxHeight: 320,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ borderTop: '1px solid var(--color-border-faint)', paddingTop: 6 }}>
            <button
              type="button"
              onClick={() => setOpenSectionExpanded((v) => !v)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 4px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                borderRadius: 6,
              }}
            >
              <span style={sectionHeaderLabelStyle}>
                In progress
                {showBatchRatio && latestTodowriteBatchProgress ? (
                  <>
                    {' '}
                    <span style={{ fontWeight: 500, color: 'var(--color-accent)' }}>
                      {latestTodowriteBatchProgress.completed}/{latestTodowriteBatchProgress.total}
                    </span>
                  </>
                ) : null}
              </span>
              <Chevron open={openSectionExpanded} />
            </button>
            {openSectionExpanded &&
              (openTodos.length > 0 ? (
                openTodos.map((todo, ti) => (
                  <TodoItem
                    key={`open-${todo.id}-${ti}`}
                    todo={todo}
                    highlighted={Boolean(highlightTodoIds?.has(todo.id))}
                    clickable={Boolean(onTodoClick)}
                    onPick={handleTodoPick}
                  />
                ))
              ) : (
                <div
                  style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '4px 6px 8px' }}
                >
                  No open todos
                </div>
              ))}
          </div>

          {doneOnList.length > 0 && (
            <div style={{ borderTop: '1px solid var(--color-border-faint)', paddingTop: 4 }}>
              <button
                type="button"
                onClick={() => setDoneOnListExpanded((v) => !v)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 4px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 6,
                }}
              >
                <span style={sectionHeaderLabelStyle}>Completed · {doneOnList.length}</span>
                <Chevron open={doneOnListExpanded} />
              </button>
              {doneOnListExpanded &&
                doneOnList.map((todo, ti) => (
                  <TodoItem
                    key={`done-${todo.id}-${ti}`}
                    todo={todo}
                    highlighted={Boolean(highlightTodoIds?.has(todo.id))}
                    clickable={Boolean(onTodoClick)}
                    onPick={handleTodoPick}
                  />
                ))}
            </div>
          )}

          {archivedCompleted.length > 0 && (
            <div style={{ borderTop: '1px solid var(--color-border-faint)', paddingTop: 4 }}>
              <button
                type="button"
                onClick={() => setHistoryExpanded((v) => !v)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 4px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 6,
                }}
              >
                <span style={sectionHeaderLabelStyle}>
                  Completed history{' '}
                  <span style={{ fontWeight: 500 }}>({archivedCompleted.length})</span>
                </span>
                <Chevron open={historyExpanded} />
              </button>
              {historyExpanded &&
                archivedCompleted.map((todo, ti) => (
                  <TodoItem
                    key={`arc-${todo.id}-${ti}`}
                    todo={todo}
                    highlighted={Boolean(highlightTodoIds?.has(todo.id))}
                    clickable={Boolean(onTodoClick)}
                    onPick={handleTodoPick}
                  />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}