import type { CanonicalTodo } from '@/entities/todo/lib/todoRegistry'

export default function TodoItem({
  todo,
  highlighted,
  clickable,
  onPick,
}: {
  todo: CanonicalTodo
  highlighted: boolean
  clickable?: boolean
  onPick?: (todo: CanonicalTodo) => void
}) {
  const isCompleted = todo.status === 'completed'
  const isInProgress = todo.status === 'in_progress'

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      data-todo-link-id={todo.id}
      onClick={clickable && onPick ? () => onPick(todo) : undefined}
      onKeyDown={
        clickable && onPick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onPick(todo)
              }
            }
          : undefined
      }
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '4px 6px',
        margin: '0 -4px',
        borderRadius: 6,
        outline: 'none',
        opacity: isCompleted ? 0.55 : 1,
        cursor: clickable ? 'pointer' : 'default',
        background: highlighted ? 'rgba(132, 69, 188, 0.12)' : 'transparent',
        boxShadow: highlighted ? '0 0 0 1px rgba(132, 69, 188, 0.35)' : 'none',
        transition: 'background 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          marginTop: 2,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isCompleted ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-success)"
            strokeWidth="2.5"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : isInProgress ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-tertiary)"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="9" />
          </svg>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: '13px',
            color: isCompleted ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
            textDecoration: isCompleted ? 'line-through' : 'none',
            lineHeight: 1.4,
            wordBreak: 'break-word',
            margin: 0,
          }}
        >
          {todo.content}
        </p>
        <p
          style={{
            margin: '2px 0 0',
            fontSize: 9,
            color: 'var(--color-text-muted)',
            fontFamily: 'ui-monospace, monospace',
            wordBreak: 'break-all',
          }}
          title="Stable session-scoped id"
        >
          id: {todo.id.slice(0, 8)}…
        </p>
      </div>
    </div>
  )
}
