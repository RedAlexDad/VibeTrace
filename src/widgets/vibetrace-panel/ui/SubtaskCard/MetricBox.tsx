import { fontSans } from './types'

export default function MetricBox({
  label,
  value,
  alert,
}: {
  label: string
  value: string
  alert?: boolean
}) {
  return (
    <div
      style={{
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3px 4px',
        minWidth: 0,
        flex: '1 1 0',
        minHeight: 44,
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        background: 'var(--color-bg-white)',
      }}
    >
      <div
        className={alert ? 'subtask-time-alert' : undefined}
        style={{
          fontFamily: fontSans,
          fontWeight: 600,
          fontSize: 9,
          lineHeight: '12px',
          textAlign: 'center',
          color: 'var(--color-text-secondary)',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: fontSans,
          fontWeight: 600,
          fontSize: 13,
          lineHeight: '16px',
          textAlign: 'center',
          color: 'var(--color-control-track-on)',
          wordBreak: 'break-all',
        }}
      >
        {value}
      </div>
    </div>
  )
}
