import PeakPricingWidget from '@/features/peak-pricing/ui/PeakPricingWidget'
import { SHOW_COMPOSER_MODEL_UI } from '@/shared/config/featureFlags'

export type SubtaskPanelHeaderProps = {
  compactionControlHint: string | null
  composerModelRef: string
  envBootstrapModel: string | null
  subtaskFlowLayoutMode: 'timeline' | 'summary'
  subtasksCount: number
  onSetFlowLayoutMode: (mode: 'timeline' | 'summary') => void
  onHidePanel: () => void
  onOpenFullscreen: () => void
}

export default function SubtaskPanelHeader({
  compactionControlHint,
  composerModelRef,
  envBootstrapModel,
  subtaskFlowLayoutMode,
  subtasksCount,
  onSetFlowLayoutMode,
  onHidePanel,
  onOpenFullscreen,
}: SubtaskPanelHeaderProps) {
  return (
    <div
      style={{
        height: 44,
        padding: '0 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--color-border-light)',
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--color-text-primary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ flexShrink: 0 }}>VibeTrace</span>
        {compactionControlHint ? (
          <span
            title="OpenCode SSE: session.compacted — context window was compacted"
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: 'var(--color-accent-strong)',
              flexShrink: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {compactionControlHint}
          </span>
        ) : null}
        {SHOW_COMPOSER_MODEL_UI && (
          <span
            title="与左侧输入框「模型」选择同步"
            style={{
              fontSize: 11,
              fontWeight: 400,
              color: 'var(--color-text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {composerModelRef.trim()
              ? `模型 ${composerModelRef.trim()}`
              : envBootstrapModel
                ? `模型 ${envBootstrapModel}（.env）`
                : '模型：服务端默认'}
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => onSetFlowLayoutMode('timeline')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontSize: 11,
              lineHeight: '16px',
              color:
                subtaskFlowLayoutMode === 'timeline'
                  ? 'var(--color-control-track-on)'
                  : 'var(--color-text-muted)',
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                boxSizing: 'border-box',
                background:
                  subtaskFlowLayoutMode === 'timeline'
                    ? 'var(--color-control-muted)'
                    : 'transparent',
                border:
                  subtaskFlowLayoutMode === 'timeline'
                    ? '1px solid var(--color-control-track-off)'
                    : '1px solid var(--color-control-muted)',
              }}
            />
            timeline
          </button>
          <button
            type="button"
            onClick={() => onSetFlowLayoutMode('summary')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontSize: 11,
              lineHeight: '16px',
              color:
                subtaskFlowLayoutMode === 'summary'
                  ? 'var(--color-control-track-on)'
                  : 'var(--color-text-muted)',
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                boxSizing: 'border-box',
                background:
                  subtaskFlowLayoutMode === 'summary'
                    ? 'var(--color-control-muted)'
                    : 'transparent',
                border:
                  subtaskFlowLayoutMode === 'summary'
                    ? '1px solid var(--color-control-track-off)'
                    : '1px solid var(--color-control-muted)',
              }}
            />
            summary
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <PeakPricingWidget />
        <button
          type="button"
          onClick={onHidePanel}
          aria-label="Hide VibeTrace panel"
          title="Hide VibeTrace panel"
          style={{
            width: 26,
            height: 26,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            color: 'var(--color-text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-bg-soft)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
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
            <path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onOpenFullscreen}
          aria-label="Open VibeTrace fullscreen"
          title="Open VibeTrace fullscreen"
          disabled={subtasksCount === 0}
          style={{
            width: 26,
            height: 26,
            border: 'none',
            background: 'transparent',
            cursor: subtasksCount === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            color:
              subtasksCount === 0
                ? 'var(--color-control-muted)'
                : 'var(--color-text-secondary)',
          }}
          onMouseEnter={(e) => {
            if (subtasksCount === 0) return
            e.currentTarget.style.background = 'var(--color-bg-soft)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
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
            <path d="M3 9V3h6" />
            <path d="M21 9V3h-6" />
            <path d="M3 15v6h6" />
            <path d="M21 15v6h-6" />
          </svg>
        </button>
      </div>
    </div>
  )
}