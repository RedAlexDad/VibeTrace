import { useEffect, useMemo, useState } from 'react'
import {
  DEEPSEEK_PEAK_HOURS_PER_DAY,
  buildLocalPeakTimeline,
  currentPeakStatus,
  minutesUntilNextChange,
  utcOffsetLabel,
  type PeakStatus,
} from '@/features/peak-pricing/lib/peakPricing'

const FONT =
  "'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"

function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${totalSeconds % 60}s`
}

/**
 * Compact 24-hour visualisation of DeepSeek peak/off-peak pricing windows.
 * Peak hours (UTC): 01–04 and 06–10; peak = 2× off-peak rates.
 */
export default function PeakPricingWidget() {
  const [now, setNow] = useState(() => new Date())

  // Refresh every 30s so the "now" marker + countdown stay in sync.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const status: PeakStatus = currentPeakStatus(now)
  const countdownSeconds = minutesUntilNextChange(now) * 60
  const timeline = useMemo(() => buildLocalPeakTimeline(now), [now])
  const offsetLabel = useMemo(() => utcOffsetLabel(now), [now])
  const isPeak = status === 'peak'
  const localNow = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div
      title={`DeepSeek peak pricing (UTC${offsetLabel})\nPeak (UTC): 01–04h & 06–10h → 2× off-peak\n${DEEPSEEK_PEAK_HOURS_PER_DAY}h of peak per day\nLocal now: ${localNow}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 11,
        fontFamily: FONT,
        color: 'var(--color-text-secondary)',
        padding: '4px 10px',
        borderRadius: 8,
        background: 'var(--color-bg-soft)',
        border: '1px solid var(--color-border-light)',
        flexShrink: 0,
      }}
    >
      {/* Local time + UTC offset */}
      <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {localNow}
        <span style={{ color: 'var(--color-text-tertiary)' }}> UTC{offsetLabel}</span>
      </span>

      {/* 24-hour strip: peak hours highlighted, off-peak muted (in local time) */}
      <div
        style={{
          display: 'flex',
          gap: 1,
          alignItems: 'stretch',
          height: 14,
        }}
      >
        {timeline.hours.map((peak, i) => (
          <div
            key={i}
            title={`${String(i).padStart(2, '0')}:00 local — ${peak ? 'peak' : 'off-peak'}`}
            style={{
              width: 5,
              borderRadius: 1,
              background: peak ? 'var(--color-warning)' : 'var(--color-success)',
              opacity: i === timeline.nowIndex ? 1 : 0.55,
              outline: i === timeline.nowIndex ? '1px solid var(--color-text-primary)' : 'none',
            }}
          />
        ))}
      </div>

      {/* Status label */}
      <span
        style={{
          fontWeight: 600,
          color: isPeak ? 'var(--color-warning)' : 'var(--color-success)',
          whiteSpace: 'nowrap',
        }}
      >
        {isPeak ? 'Peak' : 'Off-peak'}
      </span>

      {/* Countdown to next change */}
      <span style={{ color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
        → {formatCountdown(countdownSeconds)}
      </span>
    </div>
  )
}
