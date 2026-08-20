import { BASE, basicAuthHeader } from './config'
import type { GlobalSseEvent } from './types'

// ===== SSE (fetch stream — supports custom `event:` names) =====

const SSE_RECONNECT_MS = 2500

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function createSseLineDispatcher(
  onDispatch: (eventName: string, data: string) => void,
): (line: string) => void {
  let eventName = 'message'
  const dataLines: string[] = []

  return (line: string) => {
    const trimmed = line.replace(/\r$/, '')
    if (trimmed === '') {
      if (dataLines.length > 0) {
        const data = dataLines.join('\n')
        dataLines.length = 0
        const ev = eventName
        eventName = 'message'
        onDispatch(ev, data)
      } else {
        eventName = 'message'
      }
      return
    }
    if (trimmed.startsWith(':')) return
    if (trimmed.startsWith('event:')) {
      eventName = trimmed.slice(6).trim()
      return
    }
    if (trimmed.startsWith('data:')) {
      const rest = trimmed.slice(5)
      dataLines.push(rest.startsWith(' ') ? rest.slice(1) : rest)
    }
  }
}

async function streamGlobalSse(
  url: string,
  signal: AbortSignal,
  onEvent: (event: GlobalSseEvent) => void,
): Promise<void> {
  const res = await fetch(url, {
    headers: { Accept: 'text/event-stream', ...basicAuthHeader() },
    signal,
  })
  if (!res.ok) {
    throw new Error(`SSE HTTP ${res.status}`)
  }
  const body = res.body
  if (!body) throw new Error('SSE body null')

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  const dispatchLine = createSseLineDispatcher((_eventName, dataStr) => {
    try {
      const parsed = JSON.parse(dataStr) as Record<string, unknown>
      onEvent(parsed)
    } catch {
      /* ignore heartbeats / non-JSON frames */
    }
  })

  while (!signal.aborted) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const parts = buf.split('\n')
    buf = parts.pop() ?? ''
    for (const line of parts) {
      dispatchLine(line)
    }
  }
}

export function subscribeGlobalEvents(onEvent: (event: GlobalSseEvent) => void): () => void {
  const url = `${BASE}/global/event`
  const ac = new AbortController()

  ;(async function loop() {
    while (!ac.signal.aborted) {
      try {
        await streamGlobalSse(url, ac.signal, onEvent)
      } catch {
        if (ac.signal.aborted) break
      }
      if (ac.signal.aborted) break
      await sleep(SSE_RECONNECT_MS)
    }
  })()

  return () => ac.abort()
}