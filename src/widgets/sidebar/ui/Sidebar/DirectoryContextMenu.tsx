import { forwardRef } from 'react'
import type { DirMenu } from './types'

const DirectoryContextMenu = forwardRef<
  HTMLDivElement,
  {
    menu: DirMenu
    onClose: (dir: string) => void
    onDismiss: () => void
  }
>(function DirectoryContextMenu({ menu, onClose, onDismiss }, ref) {
  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: menu.y,
        left: menu.x,
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
          onClose(menu.dir)
          onDismiss()
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
  )
})

export default DirectoryContextMenu