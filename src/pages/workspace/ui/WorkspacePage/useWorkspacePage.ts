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
import type { MappedAction, OcMessage, OcPendingQuestionRequest, OcTodo } from '@/shared/types/opencode'
import type { MessageSendPayload } from '@/widgets/chat/ui/MessageInput'
import { groupAssistantSubtasks, isTodoWriteMessage } from '@/entities/subtask/lib/subtaskGrouping'
import { findSubtaskIndexForTodo, subtaskShouldUseTodoLink } from '@/entities/subtask/lib/subtaskLinkage'
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
import { SHOW_COMPOSER_MODEL_UI } from '@/shared/config/featureFlags'
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
  const [composerModelOptions, setComposerModelOptions] = useState<OcComposerModelOption[]>([])
  const [composerModelsLoading, setComposerModelsLoading] = useState(false)
  const [composerModelsError, setComposerModelsError] = useState<string | null>(null)
  /** User message sent; still polling for assistant completion */
  const [waitingForAssistantReply, setWaitingForAssistantReply] = useState(false)

  const pendingForkRef = useRef(pendingFork)
  pendingForkRef.current = pendingFork

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
    if (!SHOW_COMPOSER_MODEL_UI) return
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
    refreshSessions()
      .then((data) => {
        const sorted = [...data].sort((a, b) => b.time.updated - a.time.updated)
        if (sorted.length === 0) return
        const params = new URLSearchParams(window.location.search)
        const urlSession = params.get('session')
        const urlDir = params.get('dir')
        const fromUrl = urlSession
          ? sorted.find((s) => s.id === urlSession) ?? null
          : null
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
        }
        const first = sorted[0]!
        setSelectedSessionId(first.id)
        setSelectedDirectory(normalizeSessionDirectory(first.directory))
      })
      .catch(() => setApiConnected(false))
  }, [refreshSessions])

  /** Keep the URL in sync with the selected directory + session (survives F5). */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (selectedDirectory) params.set('dir', selectedDirectory)
    else params.delete('dir')
    if (selectedSessionId) params.set('session', selectedSessionId)
    else params.delete('session')
    const qs = params.toString()
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(null, '', next)
  }, [selectedDirectory, selectedSessionId])

  /** If the active session disappears from the list, fall back to newest in folder or globally */
  useEffect(() => {
    if (sessions.length === 0) return
    if (selectedSessionId && sessions.some((s) => s.id === selectedSessionId)) return

    const inFolder = sessions
      .filter((s) => sameDirectory(s.directory, selectedDirectory))
      .sort((a, b) => b.time.updated - a.time.updated)

    if (inFolder.length > 0) {
      setSelectedSessionId(inFolder[0]!.id)
      return
    }
    if (!selectedSessionId) return

    const sorted = [...sessions].sort((a, b) => b.time.updated - a.time.updated)
    const pick = sorted[0]!
    setSelectedSessionId(pick.id)
    setSelectedDirectory(normalizeSessionDirectory(pick.directory))
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

      if (eventType.startsWith('message') || eventType.startsWith('session')) {
        const root = event as { directory?: string }
        const eventDir = typeof root.directory === 'string' ? root.directory : undefined
        refreshSessions(eventDir ? [eventDir] : undefined)
          .then(setSessions)
          .catch(() => {})
        const dir = sessionsRef.current.find((s) => s.id === selectedSessionId)?.directory
        if (selectedSessionId) {
          getMessages(selectedSessionId, `SSE:${eventType}`, dir)
            .then(setMessages)
            .catch(() => {})
        }
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
  }, [selectedSessionId, refreshSessions])

  // Load messages + todos when session changes
  const loadSessionData = useCallback(async (sessionId: string, directory?: string) => {
    if (!sessionId) return
    setLoading(true)
    try {
      const [msgs, td] = await Promise.all([
        getMessages(sessionId, 'initial load / session switch', directory),
        getTodos(sessionId, directory),
      ])
      setMessages(msgs)
      setTodos(td)
    } catch {
      /* loading errors surface via empty state; avoid noisy console */
    } finally {
      setLoading(false)
    }
  }, [])

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
        setMessages(msgs)
      } catch {
        autoAbortedRunningKeysRef.current.delete(runKey)
      } finally {
        setAborting(false)
      }
    })()
  }, [messages, selectedSessionId, aborting, refreshSessions])

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
      const scrollRoot = messageScrollRef.current
      if (!scrollRoot) return
      if (selMatches && mid !== null) {
        scrollRoot
          .querySelector(`[data-message-index="${mid}"]`)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
      }
      const st = assistantSubtasks[linkedSubtaskIndex]
      if (!st || st.assistantMessageIndices.length === 0) return

      const noTodoConnector = linkedTodoIds === null || linkedTodoIds.size === 0

      if (noTodoConnector) {
        const anchorKey = firstFlowAnchorKeyForSubtaskSegment(st, messages, Date.now())
        if (anchorKey) {
          const esc =
            typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
              ? CSS.escape(anchorKey)
              : anchorKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
          const anchorEl = scrollRoot.querySelector(`[data-transcript-action-key="${esc}"]`)
          if (anchorEl) {
            anchorEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
            return
          }
        }
      }

      const first = Math.min(...st.assistantMessageIndices)
      scrollRoot
        .querySelector(`[data-message-index="${first}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
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
        setMessages(msgs)
      } catch {
        window.alert(
          'Failed to submit answers. Ensure OpenCode exposes POST /question/{requestID}/reply (OpenCode SDK v2 / recent opencode serve).',
        )
      } finally {
        setQuestionSubmitting(false)
      }
    },
    [selectedSessionId],
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
      setMessages(msgs)
    } catch {
      window.alert('Action failed.')
    } finally {
      setQuestionSubmitting(false)
    }
  }, [selectedSessionId])

  /** Inline question answered in a bubble: mirror bottom panel refresh + clear SSE pending bucket */
  const handleQuestionAnswered = useCallback(async () => {
    if (!selectedSessionId) return
    const dir = sessionsRef.current.find((s) => s.id === selectedSessionId)?.directory
    try {
      const msgs = await getMessages(selectedSessionId, 'after inline question submit', dir)
      setMessages(msgs)
    } catch {
      /* transcript refresh best-effort */
    }
    setPendingQuestions((prev) => {
      const next = { ...prev }
      delete next[selectedSessionId]
      return next
    })
  }, [selectedSessionId])

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
            model: composerModelRef.trim() || undefined,
          })
          const msgs = await getMessages(sid, 'after POST /message completes', dir)
          setMessages(msgs)
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
    [selectedSessionId, sessions, composerModelRef],
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
      setMessages(msgs)
    } finally {
      setAborting(false)
    }
  }, [selectedSessionId, sessions, refreshSessions])

  const selectedSession = sessions.find((s) => s.id === selectedSessionId)

  const handleSelectDirectory = useCallback(
    async (dir: string) => {
      setSelectedDirectory(dir)
      setSelectedSessionId('')
      setMessages([])
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
    [sessions, refreshSessions],
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
    setMessages([])
    setTodos([])
    setTodosSnapshotAtMessageIndex({})
    const list = await refreshSessions([dir])
    const inFolder = list
      .filter((s) => sameDirectory(s.directory, dir))
      .sort((a, b) => b.time.updated - a.time.updated)
    if (inFolder.length > 0) {
      setSelectedSessionId(inFolder[0]!.id)
    }
  }, [selectedDirectory, refreshSessions])

  const handleCloseDirectory = useCallback(
    (dir: string) => {
      const normalized = normalizeSessionDirectory(dir)
      if (!normalized) return
      setClosedDirectories((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]))
      if (sameDirectory(selectedDirectory, normalized)) {
        setSelectedDirectory('')
        setSelectedSessionId('')
        setMessages([])
        setTodos([])
        setTodosSnapshotAtMessageIndex({})
      }
      void refreshSessions()
    },
    [selectedDirectory, refreshSessions],
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
          setMessages([])
          setTodos([])
          setTodosSnapshotAtMessageIndex({})
        } else if (selectedSessionId === sessionId) {
          setMessages([])
          setTodos([])
          setTodosSnapshotAtMessageIndex({})
        }
      } catch (e) {
        window.alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setArchivingSessionId(null)
      }
    },
    [sessions, selectedSessionId, refreshSessions],
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
        setMessages(msgs)
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
              setMessages(msgsAfterSend)
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
    handleAbortMessage,
    aborting,
    messageScrollRef,
    todoPanelScrollRef,
    linkedTodoIds,
    todoPanelRevealGeneration,
    handleTodoClick,
    handleSessionTitleCommit,
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