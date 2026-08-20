/** Auto-abort when a tool stays running/pending >24h without a follow-up assistant message (once per call id). */
export const AUTO_ABORT_STUCK_RUNNING_AFTER_MS = 24 * 60 * 60 * 1000

/** If SSE lags after send, poll GET /message until an assistant message appears (streaming / long runs) */
export const POLL_ASSISTANT_INTERVAL_MS = 2000
export const POLL_ASSISTANT_MAX_ROUNDS = 90
