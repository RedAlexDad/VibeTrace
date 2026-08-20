export default function SidebarRail({
  label,
  icon,
  onExpand,
}: {
  label: string
  icon: React.ReactNode
  onExpand: () => void
}) {
  return (
    <div
      style={{
        width: 36,
        height: '100%',
        background: 'var(--color-bg-subtle)',
        borderRight: '1px solid var(--color-border-light)',
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
}