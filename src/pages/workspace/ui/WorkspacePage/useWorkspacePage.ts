import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OcSession } from '@/shared/types/opencode'
import {
  abortSession,
  createSession,
  deleteSession,
  forkSession,
  getComposerModelOptions,
  getCurrentWorkspaceDirectory,
  getMessages,
  getProjectDirectories,
  getSessions,
  getTodos,
  rejectQuestion,
  replyToQuestion,
  revertSession,
  sendMessage,
  subscribeGlobalEvents,
  updateSessionTitle,
  type OcComposerModelOption,
} from '@/shared/api/opencodeApi'
import {
  lastActivityByDirectory,
  normalizeSessionDirectory,
  uniqueDirectoriesFromSessions,
} from '@/entities/workspace/lib/sessionFolders'
import type {
  MappedAction,
  OcMessage,
  OcPendingQuestionRequest,
  OcTodo,
} from '@/shared/types/opencode'
import type { MessageSendPayload } from '@/widgets/chat/ui/MessageInput'
import { groupAssistantSubtasks, isTodoWriteMessage } from '@/entities/subtask/lib/subtaskGrouping'
import {
  findSubtaskIndexForTodo,
  subtaskShouldUseTodoLink,
} from '@/entities/subtask/lib/subtaskLinkage'
import { actionKeyMessageId } from '@/entities/action/lib/actionKey'
import { firstFlowAnchorKeyForSubtaskSegment } from '@/entities/action/lib/actionMapping'
import { parseActionRelatedSseEvent } from '@/entities/action/lib/opencodeSse'
import { setSubtaskFlowLayoutMode, setSubtaskPanelVisible } from '@/app/store/uiSlice'
import { useAppDispatch, useAppSelector } from '@/app/store/hooks'
import {
  archivedCompletedList,
  buildSessionTodoModel,
  getLatestTodowriteBatchProgress,
} from '@/entities/todo/lib/todoRegistry'
import { STORAGE_KEYS } from '@/shared/config/storageKeys'
import { buildUserMessageWithGuidance } from '@/shared/config/harnessGuidance'
import {
  buildForkPanelSnapshotBundle,
  getForkPanelSnapshotBundle,
  saveForkPanelSnapshotBundle,
  type ForkFromActionContext,
  type ForkPanelSnapshotBundle,
} from '@/features/fork-session/model/forkPanelSnapshot'
import { AUTO_ABORT_STUCK_RUNNING_AFTER_MS } from './constants'
import {
  parseEnvDirectorySeeds,
  loadManualDirectories,
  loadClosedDirectories,
  promptDirectoryPath,
  directoryKey,
  sameDirectory,
} from './directoryStorage'
import { loadComposerModelRefFromLs } from './composerModelRef'
import { mergeSessionsById, fetchSessionsAcrossDirectories } from './sessionMerge'
import { pollUntilAssistantMessage } from './pollUntilAssistantMessage'
import type { PendingFork, TodosSnapshotMap } from './types'
import { DEFAULT_MODEL_REF } from '@/widgets/chat/ui/MessageInput/ModelPicker'

export function useWorkspacePage() {
  const envDirectorySeeds = useMemo(
    () => parseEnvDirectorySeeds(import.meta.env.VITE_OPENCODE_DIRECTORY_SEEDS),
    [],
  )
  const [sessions, setSessions] = useState<OcSession[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string>('')
  const [messages, setMessages] = useState<OcMessage[]>([])
  const [todos, setTodos] = useState<OcTodo[]>([])
  const [todosSnapshotAtMessageIndex, setTodosSnapshotAtMessageIndex] = useState<TodosSnapshotMap>(
    {},
  )
  const [loading, setLoading] = useState(false)
  const [apiConnected, setApiConnected] = useState(false)
  const [linkedSubtaskIndex, setLinkedSubtaskIndex] = useState<number | null>(null)
  /** Bumps when a subtask is selected so the Todo panel auto-expands the right section */
  const [todoPanelRevealGeneration, setTodoPanelRevealGeneration] = useState(0)
  const [selectedDirectory, setSelectedDirectory] = useState<string>('')
  const [projectDirectories, setProjectDirectories] = useState<string[]>([])
  const [manualDirectories, setManualDirectories] = useState<string[]>(() =>
    loadManualDirectories(),
  )
  const [closedDirectories, setClosedDirectories] = useState<string[]>(() =>
    loadClosedDirectories(),
  )
  const [creatingSession, setCreatingSession] = useState(false)
  /** Pending question requests keyed by session (from SSE `question.asked`) */
  const [pendingQuestions, setPendingQuestions] = useState<
    Record<string, OcPendingQuestionRequest>
  >({})
  const [questionSubmitting, setQuestionSubmitting] = useState(false)
  const [aborting, setAborting] = useState(false)
  const [analysisAction, setAnalysisAction] = useState<(MappedAction & { row: number }) | null>(
    null,
  )
  const [pendingFork, setPendingFork] = useState<PendingFork | null>(null)
  const [forkBusy, setForkBusy] = useState(false)
  const [archivingSessionId, setArchivingSessionId] = useState<string | null>(null)
  const [composerModelRef, setComposerModelRef] = useState<string>(() =>
    loadComposerModelRefFromLs(),
  )
  const [composerAgent, setComposerAgent] = useState<'build' | 'plan'>(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEYS.composerAgent)
      return v === 'plan' ? 'plan' : 'build'
    } catch {
      return 'build'
    }
  })
  const [composerModelOptions, setComposerModelOptions] = useState<OcComposerModelOption[]>([])
  const [composerModelsLoading, setComposerModelsLoading] = useState(false)
  const [composerModelsError, setComposerModelsError] = useState<string | null>(null)
  /** User message sent; still polling for assistant completion */
  const [waitingForAssistantReply, setWaitingForAssistantReply] = useState(false)

  const pendingForkRef = useRef(pendingFork)
  pendingForkRef.current = pendingFork

  /** Merge incoming messages with the current list, reusing existing message
   * objects by id so `memo`-wrapped bubbles skip re-render for unchanged rows.
   * A message is reused only when its content signature is identical — streaming
   * updates (longer text / new parts) force a re-render. */
  const messagesRef = useRef<OcMessage[]>([])
  /** Assistant messages materialized by the SSE fast-path but not yet
   * committed by the server — refetches must keep them until the real
   * message appears, otherwise the streaming bubble blinks out. */
  const pendingLocalMessagesRef = useRef<OcMessage[]>([])

  const setMessagesStable = useCallback((next: OcMessage[]) => {
    const prev = messagesRef.current
    // Merge in any not-yet-committed local messages (created by the SSE
    // streaming fast-path) so refetches never blink them out. A server copy
    // only "commits" the message once it actually carries parts — during
    // generation opencode returns the message with an empty parts array,
    // which would otherwise replace our streaming bubble with a blank card.
    const serverIds = new Set(next.map((m) => m.info.id))
    const pending = pendingLocalMessagesRef.current
    const committedIds = new Set(
      pending.filter((m) => {
        const s = next.find((n) => n.info.id === m.info.id)
        return s && s.parts.length > 0
      }).map((m) => m.info.id),
    )
    pendingLocalMessagesRef.current = pending.filter((m) => {
      if (!serverIds.has(m.info.id)) return true
      return !committedIds.has(m.info.id)
    })
    // Prefer the richer local copy for messages the server hasn't filled in yet.
    const withPending = next.map((m) => {
      const local = pending.find((p) => p.info.id === m.info.id)
      if (local && !committedIds.has(m.info.id) && m.parts.length === 0 && local.parts.length > 0) {
        return local
      }
      return m
    })
    const sig = (m: OcMessage) => {
      let s = m.info.role + ':' + m.parts.length + ':'
      for (const p of m.parts) {
        s += p.type + ':'
        if (p.type === 'text' || p.type === 'reasoning') s += (p.text ?? '').length + ':'
        if (p.type === 'tool') s += (p.state?.status ?? '') + ':'
      }
      return s
    }
    const nextSig = withPending.map(sig)
    const prevSig = prev.map(sig)
    const merged = withPending.map((m, i) => {
      if (i < prev.length && prev[i]?.info.id === m.info.id && prevSig[i] === nextSig[i]) {
        return prev[i]!
      }
      return m
    })
    messagesRef.current = merged
    setMessages(merged)
  }, [])

  /** Debounce full /message refetches: SSE bursts during streaming otherwise
   * fire dozens of parallel getMessages requests and exhaust resources. */
  const sseMessagesTimerRef = useRef<number | null>(null)
  const scheduleSseMessagesRefetch = useCallback(() => {
    if (sseMessagesTimerRef.current !== null) return
    sseMessagesTimerRef.current = window.setTimeout(() => {
      sseMessagesTimerRef.current = null
      const sid = selectedSessionIdRef.current
      if (!sid) return
      const dir = sessionsRef.current.find((s) => s.id === sid)?.directory
      getMessages(sid, 'SSE:message.updated', dir)
        .then((msgs) => {
          setMessagesStable(msgs)
        })
        .catch(() => {})
    }, 300)
  }, [setMessagesStable])

  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  const refreshSessions = useCallback(
    async (extraDirectories?: Array<string | undefined>) => {
      const base = await getSessions()
      const discovered = await getProjectDirectories().catch(() => [] as string[])
      const current = await getCurrentWorkspaceDirectory().catch(() => null)
      const mergedDiscovered = Array.from(new Set([...discovered, ...(current ? [current] : [])]))
      setProjectDirectories(mergedDiscovered)
      const closed = new Set(closedDirectories)
      const extra = await fetchSessionsAcrossDirectories([
        ...envDirectorySeeds,
        ...manualDirectories.filter((d) => !closed.has(d)),
        ...(extraDirectories ?? []),
        ...mergedDiscovered.filter((d) => !closed.has(normalizeSessionDirectory(d))),
      ])
      const merged = mergeSessionsById([base, extra]).filter(
        (s) => !closed.has(normalizeSessionDirectory(s.directory)),
      )
      setSessions(merged)
      setApiConnected(true)
      return merged
    },
    [envDirectorySeeds, manualDirectories, closedDirectories],
  )

  /** Debounce session-list refetches too — streaming emits a burst of
   * message.updated/session.updated events and each naive refreshSessions
   * fans out to one GET /session per directory, exhausting resources. */
  const sseSessionsTimerRef = useRef<number | null>(null)
  const scheduleSseSessionsRefetch = useCallback(() => {
    if (sseSessionsTimerRef.current !== null) return
    sseSessionsTimerRef.current = window.setTimeout(() => {
      sseSessionsTimerRef.current = null
      refreshSessions()
        .then(setSessions)
        .catch(() => {})
    }, 400)
  }, [refreshSessions])

  const directories = useMemo(() => {
    const fromSession = uniqueDirectoriesFromSessions(sessions)
    const mergedRaw = [
      ...fromSession,
      ...projectDirectories.map((d) => normalizeSessionDirectory(d)),
      ...manualDirectories,
      selectedDirectory,
    ]
    const map = new Map<string, string>()
    for (const dir of mergedRaw) {
      const key = directoryKey(dir)
      if (!key || map.has(key)) continue
      map.set(key, normalizeSessionDirectory(dir))
    }
    const merged = [...map.values()]
      .filter((d) => d !== 'Unknown')
      .filter((d) => d !== '')
      .filter((d) => !closedDirectories.includes(d))
    return merged.sort((a, b) => {
      return a.localeCompare(b, 'zh-CN')
    })
  }, [sessions, projectDirectories, manualDirectories, selectedDirectory, closedDirectories])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.manualDirectories, JSON.stringify(manualDirectories))
  }, [manualDirectories])

  const recencyMap = useMemo(() => lastActivityByDirectory(sessions), [sessions])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.closedDirectories, JSON.stringify(closedDirectories))
  }, [closedDirectories])

  const sessionsInFolder = useMemo(() => {
    return sessions
      .filter((s) => sameDirectory(s.directory, selectedDirectory))
      .sort((a, b) => b.time.updated - a.time.updated)
  }, [sessions, selectedDirectory])

  const linkAreaRef = useRef<HTMLDivElement>(null)
  const messageScrollRef = useRef<HTMLDivElement>(null)
  /** Set by MessagePanel to scroll the virtualized list to a message index. */
  const messageScrollToIndexRef = useRef<((index: number) => void) | null>(null)
  const todoPanelScrollRef = useRef<HTMLDivElement>(null)
  const subtaskScrollRef = useRef<HTMLDivElement>(null)
  const selectedSessionIdRef = useRef(selectedSessionId)
  selectedSessionIdRef.current = selectedSessionId

  const pendingQuestionsRef = useRef(pendingQuestions)
  pendingQuestionsRef.current = pendingQuestions
  const autoAbortedRunningKeysRef = useRef<Set<string>>(new Set())

  const activeSessionDirectory = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId)?.directory,
    [sessions, selectedSessionId],
  )

  const envBootstrapModel = useMemo(() => {
    const v = import.meta.env.VITE_OPENCODE_DEFAULT_MODEL
    return typeof v === 'string' && v.trim() ? v.trim() : null
  }, [])

  const composerModelOptionsForUi = useMemo(() => {
    const t = composerModelRef.trim()
    if (!t || composerModelOptions.some((o) => o.ref === t)) return composerModelOptions
    return [...composerModelOptions, { ref: t, label: `${t}（本地已保存）` }].sort((a, b) =>
      a.ref.localeCompare(b.ref),
    )
  }, [composerModelOptions, composerModelRef])

  useEffect(() => {
    let cancelled = false
    setComposerModelsLoading(true)
    setComposerModelsError(null)
    void getComposerModelOptions(activeSessionDirectory)
      .then(({ options }) => {
        if (!cancelled) setComposerModelOptions(options)
      })
      .catch((e: unknown) => {
        if (!cancelled) setComposerModelsError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setComposerModelsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeSessionDirectory])

  const handleComposerModelRefChange = useCallback((ref: string) => {
    const t = ref.trim()
    setComposerModelRef(t)
    try {
      if (t) window.localStorage.setItem(STORAGE_KEYS.composerModelRef, t)
      else window.localStorage.removeItem(STORAGE_KEYS.composerModelRef)
    } catch {
      /* ignore */
    }
  }, [])

  const handleComposerAgentChange = useCallback((agent: 'build' | 'plan') => {
    setComposerAgent(agent)
    try {
      window.localStorage.setItem(STORAGE_KEYS.composerAgent, agent)
    } catch {
      /* ignore */
    }
  }, [])

  /** Locally cached pre-fork panel snapshot for diffing (not sent to the model) */
  const forkPanelSnapshotBundle = useMemo(
    () => getForkPanelSnapshotBundle(selectedSessionId),
    [selectedSessionId],
  )

  /** Full-screen VibeTrace overlay */
  const [subtaskFullscreenOpen, setSubtaskFullscreenOpen] = useState(false)
  /** VibeTrace side panel visibility + layout live in Redux (persisted) */
  const subtaskPanelVisible = useAppSelector((s) => s.ui.subtaskPanelVisible)
  const subtaskFlowLayoutMode = useAppSelector((s) => s.ui.subtaskFlowLayoutMode)
  const dispatch = useAppDispatch()
  /** Short-lived hint when OpenCode signals `session.compacted` for the active session */
  const [compactionControlHint, setCompactionControlHint] = useState<string | null>(null)
  /** Action rectangle click toggles per-action highlight */
  const [selection, setSelection] = useState<{ subtaskIndex: number; actionKey: string } | null>(
    null,
  )
  const handleSelectAction = useCallback((subtaskIndex: number, actionKey: string | null) => {
    setSelection((prev) => {
      if (actionKey === null) return null
      if (prev && prev.subtaskIndex === subtaskIndex && prev.actionKey === actionKey) {
        return null
      }
      return { subtaskIndex, actionKey }
    })
    if (actionKey !== null) setLinkedSubtaskIndex(subtaskIndex)
  }, [])

  /** Clear action-outline selection when clicking outside flow nodes (sidebar, transcript, todos, composer, etc.). Blank flow canvas already clears via `onSelectAction(null)`. */
  useEffect(() => {
    if (selection === null) return
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target
      if (!(el instanceof Element)) return
      if (el.closest('g.afv-action')) return
      const inSubtaskCard = el.closest('[data-subtask-card-index]')
      if (inSubtaskCard) {
        if (el.closest('svg[data-action-flow-root="1"]')) setSelection(null)
        return
      }
      setSelection(null)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [selection])

  // Load sessions on mount
  useEffect(() => {
    // Read the URL early so the async refresh cannot race the URL-sync effect below.
    const initialParams = new URLSearchParams(window.location.search)
    const initialSession = initialParams.get('session')
    const initialDir = initialParams.get('dir')
    if (initialDir) setSelectedDirectory(initialDir)
    if (initialSession) setSelectedSessionId(initialSession)

    refreshSessions()
      .then((data) => {
        const sorted = [...data].sort((a, b) => b.time.updated - a.time.updated)
        const params = new URLSearchParams(window.location.search)
        const urlSession = params.get('session')
        const urlDir = params.get('dir')
        const fromUrl = urlSession ? (sorted.find((s) => s.id === urlSession) ?? null) : null
        if (fromUrl) {
          setSelectedSessionId(fromUrl.id)
          if (urlDir) setSelectedDirectory(urlDir)
          else setSelectedDirectory(normalizeSessionDirectory(fromUrl.directory))
          return
        }
        if (urlDir) {
          const inDir = sorted
            .filter((s) => sameDirectory(s.directory, urlDir))
            .sort((a, b) => b.time.updated - a.time.updated)
          if (inDir.length > 0) {
            setSelectedDirectory(urlDir)
            setSelectedSessionId(inDir[0]!.id)
            return
          }
          // Directory exists in URL but has no sessions yet — keep it selected
          setSelectedDirectory(urlDir)
          setSelectedSessionId('')
          return
        }
        // No directory chosen: leave selection empty so the workspaces page
        // acts as the entry point instead of silently picking the newest session.
        setSelectedSessionId('')
        setSelectedDirectory('')
      })
      .catch(() => setApiConnected(false))
  }, [refreshSessions])

  /** Keep the URL in sync with the selected directory + session (survives F5). */
  useEffect(() => {
    // Guard against wiping the initial `dir`/`session` from the URL before the
    // async refresh has applied the selection from the URL on first mount.
    if (!selectedDirectory && !selectedSessionId) {
      const cur = new URLSearchParams(window.location.search)
      if (cur.get('dir') || cur.get('session')) return
    }
    const params = new URLSearchParams(window.location.search)
    if (selectedDirectory) params.set('dir', selectedDirectory)
    else params.delete('dir')
    if (selectedSessionId) params.set('session', selectedSessionId)
    else params.delete('session')
    const qs = params.toString()
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(null, '', next)
  }, [selectedDirectory, selectedSessionId])

  /** If the active session disappears from the list, fall back to newest in folder */
  useEffect(() => {
    if (sessions.length === 0) return
    if (!selectedDirectory) return
    if (selectedSessionId && sessions.some((s) => s.id === selectedSessionId)) return

    const inFolder = sessions
      .filter((s) => sameDirectory(s.directory, selectedDirectory))
      .sort((a, b) => b.time.updated - a.time.updated)

    if (inFolder.length > 0) {
      setSelectedSessionId(inFolder[0]!.id)
    }
  }, [sessions, selectedSessionId, selectedDirectory])

  useEffect(() => {
    setWaitingForAssistantReply(false)
  }, [selectedSessionId])

  // Subscribe to global SSE events
  useEffect(() => {
    const unsubscribe = subscribeGlobalEvents((event) => {
      const payload = event?.payload || event
      const eventType = payload?.type
      if (!eventType) return

      if (eventType === 'question.asked') {
        const props = payload.properties as Partial<OcPendingQuestionRequest> | undefined
        if (props?.id && props.sessionID && Array.isArray(props.questions)) {
          const root = event as { directory?: string }
          const dir = typeof root.directory === 'string' ? root.directory : undefined
          setPendingQuestions((prev) => ({
            ...prev,
            [props.sessionID!]: {
              id: props.id!,
              sessionID: props.sessionID!,
              questions: props.questions as OcPendingQuestionRequest['questions'],
              tool: props.tool,
              directory: dir,
            },
          }))
        }
      }

      if (eventType === 'question.replied' || eventType === 'question.rejected') {
        const props = payload.properties as { sessionID?: string; requestID?: string } | undefined
        if (props?.sessionID && props?.requestID) {
          setPendingQuestions((prev) => {
            const cur = prev[props.sessionID!]
            if (cur?.id === props.requestID) {
              const { [props.sessionID!]: _, ...rest } = prev
              return rest
            }
            return prev
          })
        }
      }

      if (eventType.startsWith('question')) {
        const props = payload.properties as { sessionID?: string } | undefined
        const sid = props?.sessionID
        if (sid && sid === selectedSessionIdRef.current) {
          const dir = sessionsRef.current.find((s) => s.id === sid)?.directory
          getMessages(sid, `SSE:${eventType}`, dir)
            .then(setMessages)
            .catch(() => {})
        }
      }

      if (eventType === 'message.part.updated') {
        const props = payload.properties as {
          sessionID?: string
          part?: {
            id?: string
            messageID?: string
            type?: string
            text?: string
            tool?: string
            state?: { status?: string }
          }
        } | null
        const sid = props?.sessionID
        const part = props?.part
        if (sid === selectedSessionIdRef.current && part?.id && part?.messageID) {
          const existingIdx = messagesRef.current.findIndex((m) => m.info.id === part.messageID)
          if (existingIdx >= 0) {
            // Patch the part text in place so streaming updates appear live.
            const msgs = messagesRef.current.map((m) => {
              if (m.info.id !== part.messageID) return m
              const parts = m.parts.map((p) => {
                if ('id' in p && p.id === part.id) {
                  return { ...p, text: part.text ?? '' } as (typeof m.parts)[number]
                }
                return p
              })
              return { ...m, parts }
            })
            messagesRef.current = msgs
            // Keep the pending copy in sync too, in case it is still unconfirmed.
            pendingLocalMessagesRef.current = pendingLocalMessagesRef.current.map((m) =>
              m.info.id === part.messageID ? msgs[existingIdx] : m,
            )
            setMessages(msgs)
          } else if (part.type === 'text' || part.type === 'reasoning') {
            // First part of a brand-new assistant message — materialize it so
            // streaming text appears immediately instead of after the refetch.
            const newPart = { ...part, text: part.text ?? '' }
            const newMsg: OcMessage = {
              info: {
                role: 'assistant',
                id: part.messageID,
                sessionID: sid,
                time: { created: Date.now() },
              },
              parts: [newPart as OcMessage['parts'][number]],
            }
            const msgs = [...messagesRef.current, newMsg]
            messagesRef.current = msgs
            pendingLocalMessagesRef.current = [
              ...pendingLocalMessagesRef.current.filter((m) => m.info.id !== part.messageID),
              newMsg,
            ]
            setMessages(msgs)
          }
        }
      }

      if (eventType === 'message.part.delta') {
        // Token-level text streaming: opencode sends `message.part.updated`
        // with the full text only occasionally, but emits a `delta` per token.
        // Without handling it the assistant text (esp. reasoning) stays
        // truncated until the next full refetch.
        const props = payload.properties as {
          sessionID?: string
          messageID?: string
          partID?: string
          field?: string
          delta?: string
        } | null
        const sid = props?.sessionID
        if (
          sid === selectedSessionIdRef.current &&
          props?.partID &&
          props?.messageID &&
          props.field === 'text' &&
          typeof props.delta === 'string' &&
          props.delta.length > 0
        ) {
          const existingIdx = messagesRef.current.findIndex((m) => m.info.id === props.messageID)
          if (existingIdx >= 0) {
            const targetMsg = messagesRef.current[existingIdx]
            const hasPart = targetMsg.parts.some((p) => 'id' in p && p.id === props.partID)
            if (hasPart) {
              // Append the delta to the matching text/reasoning part.
              const msgs = messagesRef.current.map((m) => {
                if (m.info.id !== props.messageID) return m
                const parts = m.parts.map((p) => {
                  if ('id' in p && p.id === props.partID) {
                    const cur = (p as { text?: string }).text ?? ''
                    if (p.type === 'text' || p.type === 'reasoning') {
                      return { ...p, text: cur + props.delta } as (typeof m.parts)[number]
                    }
                  }
                  return p
                })
                return { ...m, parts }
              })
              messagesRef.current = msgs
              pendingLocalMessagesRef.current = pendingLocalMessagesRef.current.map((m) =>
                m.info.id === props.messageID ? msgs[existingIdx] : m,
              )
              setMessages(msgs)
            } else {
              // Delta arrived before the part exists in the local copy (server
              // may stream text with a part id we haven't materialized yet).
              // Append to the last text/reasoning part of this message.
              const msgs = messagesRef.current.map((m) => {
                if (m.info.id !== props.messageID) return m
                const parts = m.parts.map((p) => {
                  const cur = (p as { text?: string }).text ?? ''
                  if ((p.type === 'text' || p.type === 'reasoning') && 'id' in p) {
                    return { ...p, text: cur + props.delta } as (typeof m.parts)[number]
                  }
                  return p
                })
                return { ...m, parts }
              })
              messagesRef.current = msgs
              pendingLocalMessagesRef.current = pendingLocalMessagesRef.current.map((m) =>
                m.info.id === props.messageID ? msgs[existingIdx] : m,
              )
              setMessages(msgs)
            }
          } else {
            // First delta of a brand-new assistant part — materialize a text
            // part so streaming text appears immediately.
            const newPart = {
              id: props.partID,
              messageID: props.messageID,
              sessionID: sid,
              type: 'text',
              text: props.delta,
            }
            const newMsg: OcMessage = {
              info: {
                role: 'assistant',
                id: props.messageID,
                sessionID: sid,
                time: { created: Date.now() },
              },
              parts: [newPart as OcMessage['parts'][number]],
            }
            const msgs = [...messagesRef.current, newMsg]
            messagesRef.current = msgs
            pendingLocalMessagesRef.current = [
              ...pendingLocalMessagesRef.current.filter((m) => m.info.id !== props.messageID),
              newMsg,
            ]
            setMessages(msgs)
          }
        }
      }

      if (eventType.startsWith('message') || eventType.startsWith('session')) {
        // Debounced session-list + message refetch — streaming emits a burst of
        // events and naive refetches exhaust browser resources. Text streaming
        // is already patched live via message.part.updated above.
        scheduleSseSessionsRefetch()
        scheduleSseMessagesRefetch()
      }

      if (eventType.startsWith('todo')) {
        const dir = sessionsRef.current.find((s) => s.id === selectedSessionId)?.directory
        if (selectedSessionId) {
          getTodos(selectedSessionId, dir)
            .then(setTodos)
            .catch(() => {})
        }
      }

      if (eventType === 'session.compacted') {
        const props = payload.properties as { sessionID?: string; sessionId?: string } | undefined
        let sid = props?.sessionID ?? props?.sessionId
        if (!sid) {
          const parsed = parseActionRelatedSseEvent(event)
          sid = parsed?.sessionID
        }
        if (!sid || sid === selectedSessionIdRef.current) {
          setCompactionControlHint(
            `Context compacted · ${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
          )
        }
      }
    })

    return unsubscribe
  }, [selectedSessionId, scheduleSseSessionsRefetch, scheduleSseMessagesRefetch])

  // Load messages + todos when session changes
  const loadSessionData = useCallback(
    async (sessionId: string, directory?: string) => {
      if (!sessionId) return
      setLoading(true)
      pendingLocalMessagesRef.current = []
      try {
        const [msgs, td] = await Promise.all([
          getMessages(sessionId, 'initial load / session switch', directory),
          getTodos(sessionId, directory),
        ])
        setMessagesStable(msgs)
        setTodos(td)
      } catch {
        /* loading errors surface via empty state; avoid noisy console */
      } finally {
        setLoading(false)
      }
    },
    [setMessagesStable],
  )

  useEffect(() => {
    void loadSessionData(selectedSessionId, activeSessionDirectory)
  }, [selectedSessionId, activeSessionDirectory, loadSessionData])

  /** Auto-abort when a tool stays running/pending >24h without a follow-up assistant message (once per call id). */
  useEffect(() => {
    if (!selectedSessionId || aborting) return
    const now = Date.now()
    let stuckCallId: string | undefined
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      if (!msg || msg.info.role !== 'assistant') continue
      const hasLaterAssistant = messages.slice(i + 1).some((m) => m?.info.role === 'assistant')
      if (hasLaterAssistant) continue
      for (const p of msg.parts) {
        if (p.type !== 'tool') continue
        const st = p.state?.status
        if (st !== 'running' && st !== 'pending') continue
        const start = p.state?.time?.start ?? msg.info.time?.created
        if (typeof start !== 'number' || !Number.isFinite(start)) continue
        if (now - start < AUTO_ABORT_STUCK_RUNNING_AFTER_MS) continue
        stuckCallId = p.callID
        break
      }
      if (stuckCallId) break
    }
    if (!stuckCallId) return

    const runKey = `${selectedSessionId}:${stuckCallId}`
    if (autoAbortedRunningKeysRef.current.has(runKey)) return
    autoAbortedRunningKeysRef.current.add(runKey)

    const dir = sessionsRef.current.find((s) => s.id === selectedSessionId)?.directory
    setAborting(true)
    void (async () => {
      try {
        await abortSession(selectedSessionId, dir)
        const [list, msgs] = await Promise.all([
          refreshSessions(),
          getMessages(selectedSessionId, 'auto abort stuck running >24h', dir),
        ])
        setSessions(list)
        setMessagesStable(msgs)
      } catch {
        autoAbortedRunningKeysRef.current.delete(runKey)
      } finally {
        setAborting(false)
      }
    })()
  }, [messages, selectedSessionId, aborting, refreshSessions, setMessagesStable])

  useEffect(() => {
    setTodosSnapshotAtMessageIndex({})
  }, [selectedSessionId])

  // Snapshot todos at the latest todo-write message for completed-item diffs during regrouping
  useEffect(() => {
    if (!selectedSessionId || loading) return
    const writeIdxs: number[] = []
    messages.forEach((m, i) => {
      if (isTodoWriteMessage(m)) writeIdxs.push(i)
    })
    if (writeIdxs.length === 0) return
    const lastWrite = writeIdxs[writeIdxs.length - 1]!
    const key = String(lastWrite)
    setTodosSnapshotAtMessageIndex((prev) => ({
      ...prev,
      [key]: todos.map((t) => ({ ...t })),
    }))
  }, [messages, todos, selectedSessionId, loading])

  const sessionTodoModel = useMemo(
    () => buildSessionTodoModel(messages, todos, todosSnapshotAtMessageIndex),
    [messages, todos, todosSnapshotAtMessageIndex],
  )

  const archivedForPanel = useMemo(
    () => archivedCompletedList(sessionTodoModel.completedArchive),
    [sessionTodoModel.completedArchive],
  )

  const latestTodowriteBatchProgress = useMemo(
    () => getLatestTodowriteBatchProgress(sessionTodoModel, archivedForPanel),
    [sessionTodoModel, archivedForPanel],
  )

  const assistantSubtasks = useMemo(() => {
    const fb = sessionTodoModel.latestActive.length > 0 ? sessionTodoModel.latestActive : todos
    return groupAssistantSubtasks(messages, {
      canonicalTodosAtMessageIndex(i) {
        const c = sessionTodoModel.canonicalAtMessageIndex.get(i)
        return c !== undefined && c.length > 0 ? c : undefined
      },
      todosAfterMessageIndex(i) {
        const snap = todosSnapshotAtMessageIndex[String(i)]
        return snap !== undefined ? snap : undefined
      },
      fallbackSessionTodos: fb,
    })
  }, [messages, todosSnapshotAtMessageIndex, todos, sessionTodoModel])

  /**
   * Right-rail cards mirror `groupAssistantSubtasks`, including planning segments before the first todowrite.
   */
  const visibleSubtasks = useMemo(
    () => assistantSubtasks.map((subtask, sourceIndex) => ({ subtask, sourceIndex })),
    [assistantSubtasks],
  )

  /** Execution-phase cards: highlight Todo rows via linked ids */
  const linkedTodoIds = useMemo(() => {
    if (linkedSubtaskIndex === null) return null
    const st = assistantSubtasks[linkedSubtaskIndex]
    if (!st || !subtaskShouldUseTodoLink(st)) return null
    return new Set(st.linkedTodoIds)
  }, [linkedSubtaskIndex, assistantSubtasks])

  /** Parent message index for scroll-to when an action glyph is selected in the flow. */
  const linkedMessageIndexForConnector = useMemo(() => {
    if (!selection) return null
    const mid = actionKeyMessageId(selection.actionKey)
    if (!mid) return null
    const idx = messages.findIndex((m) => m.info.id === mid)
    return idx >= 0 ? idx : null
  }, [selection, messages])

  const linkedMessageToAction = useMemo(() => {
    if (linkedSubtaskIndex === null || selection === null) return null
    if (selection.subtaskIndex !== linkedSubtaskIndex) return null
    const mi = linkedMessageIndexForConnector
    if (mi === null) return null
    return {
      messageIndex: mi,
      actionKey: selection.actionKey,
      subtaskIndex: selection.subtaskIndex,
    }
  }, [linkedSubtaskIndex, selection, linkedMessageIndexForConnector])

  /** Planning / no linked todo ids: same message→flow geometry as selection, anchored on first segment action */
  const noTodoAnchor = useMemo(() => {
    if (linkedSubtaskIndex === null) return null
    const st = assistantSubtasks[linkedSubtaskIndex]
    if (!st || subtaskShouldUseTodoLink(st)) return null
    const actionKey = firstFlowAnchorKeyForSubtaskSegment(st, messages, Date.now())
    if (!actionKey) return null
    const mid = actionKeyMessageId(actionKey)
    if (!mid) return null
    const messageIndex = messages.findIndex((m) => m.info.id === mid)
    if (messageIndex < 0) return null
    return { messageIndex, actionKey }
  }, [linkedSubtaskIndex, assistantSubtasks, messages])

  const toggleSubtaskLink = useCallback((si: number) => {
    setLinkedSubtaskIndex((prev) => {
      const next = prev === si ? null : si
      setSelection((sel) => {
        if (!sel) return null
        if (next === null || sel.subtaskIndex !== next) return null
        return sel
      })
      return next
    })
  }, [])

  const handleTodoClick = useCallback(
    (todo: OcTodo) => {
      const preferred = findSubtaskIndexForTodo(assistantSubtasks, todo)
      if (preferred !== null && subtaskShouldUseTodoLink(assistantSubtasks[preferred]!)) {
        setLinkedSubtaskIndex(preferred)
        return
      }
      const id = todo.id?.trim()
      if (!id) return
      const fallback = visibleSubtasks.find(({ subtask }) => subtask.linkedTodoIds.includes(id))
      if (fallback) setLinkedSubtaskIndex(fallback.sourceIndex)
    },
    [assistantSubtasks, visibleSubtasks],
  )

  useEffect(() => {
    if (!compactionControlHint) return
    const id = window.setTimeout(() => setCompactionControlHint(null), 8000)
    return () => window.clearTimeout(id)
  }, [compactionControlHint])

  useEffect(() => {
    setCompactionControlHint(null)
    setLinkedSubtaskIndex(null)
    setTodoPanelRevealGeneration(0)
    setSelection(null)
  }, [selectedSessionId])

  useEffect(() => {
    if (linkedSubtaskIndex !== null) {
      setTodoPanelRevealGeneration((g) => g + 1)
    }
  }, [linkedSubtaskIndex])

  useEffect(() => {
    if (linkedSubtaskIndex !== null && linkedSubtaskIndex >= assistantSubtasks.length) {
      setLinkedSubtaskIndex(null)
    }
  }, [linkedSubtaskIndex, assistantSubtasks.length])

  useEffect(() => {
    if (linkedTodoIds && linkedTodoIds.size > 0) {
      let inner = 0
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => {
          const scroll = todoPanelScrollRef.current
          if (!scroll) return
          for (const el of scroll.querySelectorAll('[data-todo-link-id]')) {
            const k = el.getAttribute('data-todo-link-id')?.trim() ?? ''
            if (k && linkedTodoIds.has(k)) {
              el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
              break
            }
          }
        })
      })
      return () => {
        cancelAnimationFrame(outer)
        cancelAnimationFrame(inner)
      }
    }
  }, [linkedSubtaskIndex, linkedTodoIds, todoPanelRevealGeneration])

  useEffect(() => {
    if (linkedSubtaskIndex === null) return
    const mid = linkedMessageIndexForConnector
    const selMatches =
      selection !== null && selection.subtaskIndex === linkedSubtaskIndex && mid !== null
    requestAnimationFrame(() => {
      const scrollToIndex = messageScrollToIndexRef.current
      if (selMatches && mid !== null) {
        scrollToIndex?.(mid)
        return
      }
      const st = assistantSubtasks[linkedSubtaskIndex]
      if (!st || st.assistantMessageIndices.length === 0) return

      const noTodoConnector = linkedTodoIds === null || linkedTodoIds.size === 0

      if (noTodoConnector) {
        const anchorKey = firstFlowAnchorKeyForSubtaskSegment(st, messages, Date.now())
        if (anchorKey) {
          const mid2 = actionKeyMessageId(anchorKey)
          if (mid2) {
            const messageIndex = messages.findIndex((m) => m.info.id === mid2)
            if (messageIndex >= 0) {
              scrollToIndex?.(messageIndex)
              return
            }
          }
        }
      }

      const first = Math.min(...st.assistantMessageIndices)
      scrollToIndex?.(first)
    })
  }, [
    linkedSubtaskIndex,
    assistantSubtasks,
    linkedMessageIndexForConnector,
    selection,
    linkedTodoIds,
    messages,
  ])

  useEffect(() => {
    if (linkedSubtaskIndex === null) return
    requestAnimationFrame(() => {
      subtaskScrollRef.current
        ?.querySelector(`[data-subtask-card-index="${linkedSubtaskIndex}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }, [linkedSubtaskIndex])

  /**
   * On session enter, if the VibeTrace panel is open, scroll its card list to the
   * bottom — mirrors the chat auto-scroll so both columns land on the latest turn.
   */
  useEffect(() => {
    if (!subtaskPanelVisible) return
    if (loading) return
    const root = subtaskScrollRef.current
    if (!root) return
    const frame = requestAnimationFrame(() => {
      root.scrollTop = root.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [selectedSessionId, messages, loading, subtaskPanelVisible, assistantSubtasks.length])

  const handleSessionTitleCommit = useCallback(
    async (title: string) => {
      if (!selectedSessionId) return
      const dir = sessions.find((s) => s.id === selectedSessionId)?.directory
      await updateSessionTitle(selectedSessionId, title, dir)
      const list = await refreshSessions()
      setSessions(list)
    },
    [selectedSessionId, sessions, refreshSessions],
  )

  const renameSessionById = useCallback(
    async (sessionId: string, title: string) => {
      const s = sessions.find((x) => x.id === sessionId)
      const dir = s?.directory
      await updateSessionTitle(sessionId, title, dir)
      const list = await refreshSessions()
      setSessions(list)
    },
    [sessions, refreshSessions],
  )

  const handleQuestionReply = useCallback(
    async (answers: string[][]) => {
      const pq = pendingQuestionsRef.current[selectedSessionId]
      if (!pq) return
      setQuestionSubmitting(true)
      try {
        await replyToQuestion(pq.id, answers, pq.directory)
        setPendingQuestions((prev) => {
          const { [pq.sessionID]: _, ...rest } = prev
          return rest
        })
        const dir = sessionsRef.current.find((s) => s.id === selectedSessionId)?.directory
        const msgs = await getMessages(selectedSessionId, 'after question reply', dir)
        setMessagesStable(msgs)
      } catch {
        window.alert(
          'Failed to submit answers. Ensure OpenCode exposes POST /question/{requestID}/reply (OpenCode SDK v2 / recent opencode serve).',
        )
      } finally {
        setQuestionSubmitting(false)
      }
    },
    [selectedSessionId, setMessagesStable],
  )

  const handleQuestionReject = useCallback(async () => {
    const pq = pendingQuestionsRef.current[selectedSessionId]
    if (!pq) return
    setQuestionSubmitting(true)
    try {
      await rejectQuestion(pq.id, pq.directory)
      setPendingQuestions((prev) => {
        const { [pq.sessionID]: _, ...rest } = prev
        return rest
      })
      const dir = sessionsRef.current.find((s) => s.id === selectedSessionId)?.directory
      const msgs = await getMessages(selectedSessionId, 'after question reject', dir)
      setMessagesStable(msgs)
    } catch {
      window.alert('Action failed.')
    } finally {
      setQuestionSubmitting(false)
    }
  }, [selectedSessionId, setMessagesStable])

  /** Inline question answered in a bubble: mirror bottom panel refresh + clear SSE pending bucket */
  const handleQuestionAnswered = useCallback(async () => {
    if (!selectedSessionId) return
    const dir = sessionsRef.current.find((s) => s.id === selectedSessionId)?.directory
    try {
      const msgs = await getMessages(selectedSessionId, 'after inline question submit', dir)
      setMessagesStable(msgs)
    } catch {
      /* transcript refresh best-effort */
    }
    setPendingQuestions((prev) => {
      const next = { ...prev }
      delete next[selectedSessionId]
      return next
    })
  }, [selectedSessionId, setMessagesStable])

  const handleSendMessage = useCallback(
    async (payload: MessageSendPayload) => {
      if (!selectedSessionId) return
      const dir = sessions.find((s) => s.id === selectedSessionId)?.directory
      const sid = selectedSessionId
      const text = buildUserMessageWithGuidance(payload.combinedText)
      const images = payload.imageParts
      // OpenCode often finishes POST /message only after the agent turn — awaiting here would keep the composer disabled.
      // Fire-and-forget like fork’s first message: rely on SSE + a follow-up GET /message poll.
      void (async () => {
        try {
          await sendMessage(sid, text, dir, {
            imageParts: images,
            model: composerModelRef.trim() || DEFAULT_MODEL_REF,
            agent: composerAgent,
          })
          const msgs = await getMessages(sid, 'after POST /message completes', dir)
          setMessagesStable(msgs)
          const last = msgs[msgs.length - 1]
          if (last?.info.role === 'user') {
            setWaitingForAssistantReply(true)
            try {
              await pollUntilAssistantMessage(
                sid,
                dir,
                () => selectedSessionIdRef.current === sid,
                setMessages,
              )
            } finally {
              setWaitingForAssistantReply(false)
            }
          }
        } catch (e) {
          window.alert(`Send failed: ${e instanceof Error ? e.message : String(e)}`)
          setWaitingForAssistantReply(false)
        }
      })()
    },
    [selectedSessionId, sessions, composerModelRef, composerAgent, setMessagesStable],
  )

  /** Rewind the session to a user message and resend it with new text —
   * surfaces as "editing" the sent message. */
  const handleEditMessage = useCallback(
    async (messageID: string, newText: string) => {
      if (!selectedSessionId) return
      const dir = sessions.find((s) => s.id === selectedSessionId)?.directory
      const sid = selectedSessionId
      try {
        await revertSession(sid, messageID, dir)
        await sendMessage(sid, newText, dir, {
          model: composerModelRef.trim() || DEFAULT_MODEL_REF,
          agent: composerAgent,
        })
        const msgs = await getMessages(sid, 'after edit resend', dir)
        setMessagesStable(msgs)
        setWaitingForAssistantReply(true)
        try {
          await pollUntilAssistantMessage(
            sid,
            dir,
            () => selectedSessionIdRef.current === sid,
            setMessagesStable,
          )
        } finally {
          setWaitingForAssistantReply(false)
        }
        const [list, finalMsgs] = await Promise.all([
          refreshSessions(),
          getMessages(sid, 'after edit final refresh', dir),
        ])
        setSessions(list)
        setMessagesStable(finalMsgs)
        // Re-pin the list to the bottom now that the resend is done.
        requestAnimationFrame(() => {
          messageScrollToIndexRef.current?.(
            Math.max(0, (finalMsgs?.length ?? 1) - 1),
          )
        })
      } catch (e) {
        window.alert(`Edit failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [
      selectedSessionId,
      sessions,
      composerModelRef,
      composerAgent,
      setMessagesStable,
      refreshSessions,
      messageScrollToIndexRef,
    ],
  )

  const handleAbortMessage = useCallback(async () => {
    if (!selectedSessionId) return
    const dir = sessions.find((s) => s.id === selectedSessionId)?.directory
    setAborting(true)
    try {
      await abortSession(selectedSessionId, dir)
      const [list, msgs] = await Promise.all([
        refreshSessions(),
        getMessages(selectedSessionId, 'after abort refresh', dir),
      ])
      setSessions(list)
      setMessagesStable(msgs)
    } finally {
      setAborting(false)
    }
  }, [selectedSessionId, sessions, refreshSessions, setMessagesStable])

  const selectedSession = sessions.find((s) => s.id === selectedSessionId)

  const handleSelectDirectory = useCallback(
    async (dir: string) => {
      setSelectedDirectory(dir)
      setSelectedSessionId('')
      setMessagesStable([])
      setTodos([])
      setTodosSnapshotAtMessageIndex({})

      const currentInFolder = sessions
        .filter((s) => sameDirectory(s.directory, dir))
        .sort((a, b) => b.time.updated - a.time.updated)
      if (currentInFolder.length > 0) {
        setSelectedSessionId(currentInFolder[0]!.id)
        return
      }

      const list = await refreshSessions([dir])
      const refreshedInFolder = list
        .filter((s) => sameDirectory(s.directory, dir))
        .sort((a, b) => b.time.updated - a.time.updated)
      if (refreshedInFolder.length > 0) {
        setSelectedSessionId(refreshedInFolder[0]!.id)
      }
    },
    [sessions, refreshSessions, setMessagesStable],
  )

  const handleCreateSession = useCallback(async () => {
    setCreatingSession(true)
    try {
      const dir = selectedDirectory || undefined
      const created = await createSession(dir)
      const list = await refreshSessions([created.directory])
      setSessions(list)
      setApiConnected(true)
      setSelectedDirectory(normalizeSessionDirectory(created.directory))
      setSelectedSessionId(created.id)
    } catch {
      setApiConnected(false)
    } finally {
      setCreatingSession(false)
    }
  }, [selectedDirectory, refreshSessions])

  const handleAddDirectory = useCallback(async () => {
    const dir = promptDirectoryPath(selectedDirectory || '')
    if (!dir) return
    setManualDirectories((prev) => (prev.includes(dir) ? prev : [...prev, dir]))
    setClosedDirectories((prev) => prev.filter((d) => d !== dir))
    setSelectedDirectory(dir)
    setSelectedSessionId('')
    setMessagesStable([])
    setTodos([])
    setTodosSnapshotAtMessageIndex({})
    const list = await refreshSessions([dir])
    const inFolder = list
      .filter((s) => sameDirectory(s.directory, dir))
      .sort((a, b) => b.time.updated - a.time.updated)
    if (inFolder.length > 0) {
      setSelectedSessionId(inFolder[0]!.id)
    }
  }, [selectedDirectory, refreshSessions, setMessagesStable])

  const handleCloseDirectory = useCallback(
    (dir: string) => {
      const normalized = normalizeSessionDirectory(dir)
      if (!normalized) return
      setClosedDirectories((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]))
      if (sameDirectory(selectedDirectory, normalized)) {
        setSelectedDirectory('')
        setSelectedSessionId('')
        setMessagesStable([])
        setTodos([])
        setTodosSnapshotAtMessageIndex({})
      }
      void refreshSessions()
    },
    [selectedDirectory, refreshSessions, setMessagesStable],
  )

  const handleArchiveSession = useCallback(
    async (sessionId: string) => {
      const s = sessions.find((x) => x.id === sessionId)
      const label = (s?.title || 'Untitled').slice(0, 80)
      if (
        !window.confirm(
          `Delete session "${label}"?\n\nThis calls OpenCode DELETE /session/:id and removes the conversation from the server. This usually cannot be undone.`,
        )
      ) {
        return
      }
      const dir = s?.directory
      setArchivingSessionId(sessionId)
      try {
        await deleteSession(sessionId, dir)
        setPendingQuestions((prev) => {
          const { [sessionId]: _, ...rest } = prev
          return rest
        })
        const list = await refreshSessions()
        setSessions(list)
        setApiConnected(true)
        if (list.length === 0) {
          setSelectedSessionId('')
          setMessagesStable([])
          setTodos([])
          setTodosSnapshotAtMessageIndex({})
        } else if (selectedSessionId === sessionId) {
          setMessagesStable([])
          setTodos([])
          setTodosSnapshotAtMessageIndex({})
        }
      } catch (e) {
        window.alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setArchivingSessionId(null)
      }
    },
    [sessions, selectedSessionId, refreshSessions, setMessagesStable],
  )

  const handleForkFromAction = useCallback(
    (action: MappedAction & { row: number }, forkCtx?: ForkFromActionContext) => {
      const targetSessionId = action.sessionID || selectedSessionId
      if (!targetSessionId || !action.messageID) return
      setPendingFork({ action, forkCtx })
    },
    [selectedSessionId],
  )

  const handleConfirmForkWithPrompt = useCallback(
    async (forkPrompt: string) => {
      const pending = pendingForkRef.current
      if (!pending) return
      const { action } = pending
      const targetSessionId = action.sessionID || selectedSessionId
      if (!targetSessionId || !action.messageID) {
        setPendingFork(null)
        return
      }
      const dir =
        sessions.find((s) => s.id === targetSessionId)?.directory ?? activeSessionDirectory

      setForkBusy(true)
      try {
        const { forkCtx } = pending
        let bundle: ForkPanelSnapshotBundle | null = null
        if (forkCtx) {
          try {
            bundle = await buildForkPanelSnapshotBundle({
              messages,
              visibleSubtasks,
              sessionDirectory: dir,
              forkAnchorMessageId: action.messageID,
              forkAnchorPartId: action.partId,
              sourceParentSessionId: targetSessionId,
              forkCtx,
            })
          } catch {
            /* snapshot optional */
          }
        }

        const forked = await forkSession(targetSessionId, {
          messageID: action.messageID,
          directory: dir,
        })
        if (bundle) {
          saveForkPanelSnapshotBundle(forked.id, bundle)
        }

        const list = await refreshSessions([forked.directory])
        setSessions(list)
        setApiConnected(true)
        setSelectedDirectory(normalizeSessionDirectory(forked.directory))
        setSelectedSessionId(forked.id)
        const [msgs, td] = await Promise.all([
          getMessages(forked.id, 'after fork load session', forked.directory),
          getTodos(forked.id, forked.directory),
        ])
        setMessagesStable(msgs)
        setTodos(td)

        const userText = forkPrompt.trim()
        if (userText.length > 0) {
          // POST /message may return only after the agent turn; don’t block the composer on it.
          void (async () => {
            try {
              await sendMessage(
                forked.id,
                buildUserMessageWithGuidance(userText),
                forked.directory,
                {
                  model: composerModelRef.trim() || undefined,
                },
              )
              const msgsAfterSend = await getMessages(
                forked.id,
                'after fork first user message',
                forked.directory,
              )
              setMessagesStable(msgsAfterSend)
              const lastFork = msgsAfterSend[msgsAfterSend.length - 1]
              if (lastFork?.info.role === 'user') {
                setWaitingForAssistantReply(true)
                try {
                  await pollUntilAssistantMessage(
                    forked.id,
                    forked.directory,
                    () => selectedSessionIdRef.current === forked.id,
                    setMessages,
                  )
                } finally {
                  setWaitingForAssistantReply(false)
                }
              }
            } catch (err) {
              window.alert(
                `Failed to send the first message after fork: ${err instanceof Error ? err.message : String(err)}\n\nCheck that OpenCode is running, VITE_OPENCODE_BASE matches your terminal, and POST …/message returns 200 in the Network tab.`,
              )
            }
          })()
        }
        setPendingFork(null)
        setForkBusy(false)
      } catch {
        setPendingFork(null)
      } finally {
        setForkBusy(false)
      }
    },
    [
      selectedSessionId,
      sessions,
      activeSessionDirectory,
      messages,
      visibleSubtasks,
      refreshSessions,
      composerModelRef,
      setMessagesStable,
    ],
  )

  const handleAnalyzeFromAction = useCallback((action: MappedAction & { row: number }) => {
    setAnalysisAction(action)
  }, [])

  const setFlowLayoutMode = useCallback(
    (mode: 'timeline' | 'summary') => {
      dispatch(setSubtaskFlowLayoutMode(mode))
    },
    [dispatch],
  )

  const hideSubtaskPanel = useCallback(() => {
    dispatch(setSubtaskPanelVisible(false))
  }, [dispatch])

  const showSubtaskPanel = useCallback(() => {
    dispatch(setSubtaskPanelVisible(true))
  }, [dispatch])

  const openFullscreen = useCallback(() => {
    setSubtaskFullscreenOpen(true)
  }, [])

  const closeFullscreen = useCallback(() => {
    setSubtaskFullscreenOpen(false)
  }, [])

  const closeForkModal = useCallback(() => {
    if (!forkBusy) setPendingFork(null)
  }, [forkBusy])

  const closeAnalysisModal = useCallback(() => {
    setAnalysisAction(null)
  }, [])

  return {
    sessionsInFolder,
    directories,
    recencyMap,
    selectedDirectory,
    handleSelectDirectory,
    selectedSessionId,
    setSelectedSessionId,
    handleCreateSession,
    creatingSession,
    handleArchiveSession,
    archivingSessionId,
    apiConnected,
    handleAddDirectory,
    handleCloseDirectory,
    linkAreaRef,
    messages,
    sessionTodoModel,
    archivedForPanel,
    latestTodowriteBatchProgress,
    loading,
    waitingForAssistantReply,
    selectedSession,
    loadSessionData,
    activeSessionDirectory,
    handleSendMessage,
    handleEditMessage,
    handleAbortMessage,
    aborting,
    messageScrollRef,
    messageScrollToIndexRef,
    todoPanelScrollRef,
    linkedTodoIds,
    todoPanelRevealGeneration,
    handleTodoClick,
    handleSessionTitleCommit,
    renameSessionById,
    pendingQuestions,
    handleQuestionReply,
    handleQuestionReject,
    questionSubmitting,
    handleQuestionAnswered,
    composerModelRef,
    handleComposerModelRefChange,
    composerModelOptionsForUi,
    composerModelsLoading,
    composerModelsError,
    envBootstrapModel,
    composerAgent,
    handleComposerAgentChange,
    subtaskPanelVisible,
    subtaskFlowLayoutMode,
    setFlowLayoutMode,
    hideSubtaskPanel,
    showSubtaskPanel,
    compactionControlHint,
    visibleSubtasks,
    linkedSubtaskIndex,
    toggleSubtaskLink,
    subtaskScrollRef,
    forkPanelSnapshotBundle,
    selection,
    handleSelectAction,
    subtaskFullscreenOpen,
    openFullscreen,
    closeFullscreen,
    handleForkFromAction,
    handleAnalyzeFromAction,
    pendingFork,
    forkBusy,
    closeForkModal,
    handleConfirmForkWithPrompt,
    linkedMessageToAction,
    noTodoAnchor,
    analysisAction,
    closeAnalysisModal,
  }
}
