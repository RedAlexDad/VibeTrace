/**
 * DeepSeek peak/off-peak pricing windows.
 * Peak hours (UTC): 01:00–04:00 and 06:00–10:00 — rates are 2× off-peak.
 * Source: https://api-docs.deepseek.com/quick_start/pricing
 */

/** Peak intervals in UTC, [startHour, endHour) pairs. */
export const DEEPSEEK_PEAK_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [1, 4],
  [6, 10],
] as const

export type PeakStatus = 'peak' | 'off-peak'

/** Total hours covered by peak windows in one day (01–04 = 3h, 06–10 = 4h → 7h). */
export const DEEPSEEK_PEAK_HOURS_PER_DAY = DEEPSEEK_PEAK_WINDOWS.reduce(
  (acc, [a, b]) => acc + (b - a),
  0,
)

/** Whether the given UTC hour (0–23) falls inside a peak window. */
export function isPeakUtcHour(hour: number): boolean {
  return DEEPSEEK_PEAK_WINDOWS.some(([start, end]) => hour >= start && hour < end)
}

/** Peak/off-peak status for a specific UTC hour. */
export function peakStatusForUtcHour(hour: number): PeakStatus {
  return isPeakUtcHour(hour) ? 'peak' : 'off-peak'
}

/** Peak/off-peak status right now (based on current UTC time). */
export function currentPeakStatus(date: Date = new Date()): PeakStatus {
  return peakStatusForUtcHour(date.getUTCHours())
}

/** Minutes until the next peak/off-peak boundary switches, starting from `date`. */
export function minutesUntilNextChange(date: Date = new Date()): number {
  const nowUtcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60
  const boundaries: number[] = []
  for (const [start, end] of DEEPSEEK_PEAK_WINDOWS) {
    boundaries.push(start * 60, end * 60)
  }
  const today = boundaries.map((m) => (m - nowUtcMinutes + 1440) % 1440)
  return Math.round(Math.min(...today))
}

export interface PeakDayTimeline {
  /** 24 hourly buckets, 0 = 00:00 UTC. `true` = peak. */
  hours: boolean[]
  /** Index of the current hour (UTC). */
  nowIndex: number
}

/**
 * Build a 24h timeline in *local* time: peak windows are shifted by the local
 * UTC offset so the strip matches what the user sees on the clock.
 */
export function buildLocalPeakTimeline(date: Date = new Date()): {
  hours: boolean[]
  nowIndex: number
  utcOffsetHours: number
} {
  const offsetMinutes = -date.getTimezoneOffset()
  const offsetHours = offsetMinutes / 60
  const hours: boolean[] = []
  for (let localHour = 0; localHour < 24; localHour++) {
    // Convert local hour -> UTC (wrap), then test the window in UTC terms.
    const utcHour = (((localHour - offsetHours) % 24) + 24) % 24
    hours.push(isPeakUtcHour(Math.floor(utcHour)))
  }
  return { hours, nowIndex: date.getHours(), utcOffsetHours: offsetHours }
}

/** UTC offset as a signed label, e.g. `+3` or `-5`. */
export function utcOffsetLabel(date: Date = new Date()): string {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return m ? `${sign}${h}:${String(m).padStart(2, '0')}` : `${sign}${h}`
}
