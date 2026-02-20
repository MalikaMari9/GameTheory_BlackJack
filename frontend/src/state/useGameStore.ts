import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  ErrorMessage,
  EventMessage,
  SeatView,
  Snapshot,
  WelcomeMessage,
} from '../types/messages'
import { parseCards } from '../utils/cards'
import { makeId } from '../utils/id'
import { generateRoomCode, normalizeRoomCode } from '../utils/roomCode'
import { BlackjackWsClient } from '../ws/client'
import { clientMsg } from '../ws/protocol'
import type { AdminConfigMsg } from '../ws/protocol'
import { getWsUrl } from '../ws/url'
import {
  clearIdentity,
  loadIdentity,
  loadRememberPreference,
  persistIdentity,
  persistRememberPreference,
} from './identity'
import { applyEventToVisual, applySnapshotToVisual, makeInitialVisualState } from './visual/reducer'
import type { VisualState } from './visual/types'
import type { Announcement } from '../components/animation/AnnouncementOverlay'

export type Stage = 'nickname' | 'lobby' | 'table' | 'admin' | 'anim' | 'trans' | 'layout'

export type GameStore = {
  stage: Stage
  setStage: (s: Stage) => void
  status: 'idle' | 'connecting' | 'connected' | 'closed'
  connected: boolean
  wsUrl: string
  tableId: string
  setTableId: (v: string) => void

  nickname: string
  setNickname: (v: string) => void
  rememberIdentity: boolean
  setRememberIdentity: (v: boolean) => void

  snapshot: Snapshot | null
  events: EventMessage[]
  seats: SeatView[]
  phase: string
  meta: Record<string, string>
  reshufflePct: string
  roundId: string

  playerId: string | null
  reconnectToken: string | null
  lastError: ErrorMessage | null

  betAmount: string
  setBetAmount: (v: string) => void

  dealerCards: string[]
  dealerFaceDown: boolean

  visual: VisualState
  announcement: Announcement | null

  connect: () => void
  resetSession: () => void
  onReadyToggle: () => void
  onBet: () => void
  onHit: () => void
  onStand: () => void
  onDouble: () => void
  onNext: () => void
  onVote: (vote: 'yes' | 'no') => void
  onSync: () => void
  pendingAdvanceSeat: number
  pendingDoubleSeat: number
  onAdminConfig: (payload: Omit<AdminConfigMsg, 'type'>) => void
}

const getCurrentPath = () =>
  (window.location.pathname.replace(/\/+$/, '') || '/').toLowerCase()

const isLabPath = (path = getCurrentPath()) =>
  path === '/anim' || path === '/transtest' || path === '/layouttest'

export const useGameStore = (): GameStore => {
  const clientRef = useRef<BlackjackWsClient | null>(null)
  const intentionalCloseRef = useRef(false)
  const reconnectTimerRef = useRef<number | null>(null)
  const reconnectAttemptRef = useRef(0)
  const connectNickRef = useRef<string>('')
  const rememberIdentityRef = useRef<boolean>(true)
  const tableIdRef = useRef<string>('default')
  const stageRef = useRef<Stage>('nickname')
  const announceIdRef = useRef(1)
  const announceQueueRef = useRef<Announcement[]>([])
  const announceActiveRef = useRef<Announcement | null>(null)
  const announceActiveUntilRef = useRef(0)
  const announceClearTimerRef = useRef<number | null>(null)
  const announcedSessionIdsRef = useRef<Set<string>>(new Set())
  const seenEventIdsRef = useRef<Set<string>>(new Set())
  const betResetRoundKeyRef = useRef<string>('')
  const statusRef = useRef<'idle' | 'connecting' | 'connected' | 'closed'>('idle')
  const snapshotRef = useRef<Snapshot | null>(null)
  const lastEventIdRef = useRef<string | null>(null)
  const syncInFlightRef = useRef(false)
  const lastSyncAtRef = useRef(0)
  const syncResetTimerRef = useRef<number | null>(null)

  const [stage, setStage] = useState<Stage>('nickname')
  const [nickname, setNickname] = useState('')
  const [tableId, setTableId] = useState('default')
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'closed'>(
    'idle'
  )

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [events, setEvents] = useState<EventMessage[]>([])
  const [visual, setVisual] = useState<VisualState>(() => makeInitialVisualState('default'))
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [reconnectToken, setReconnectToken] = useState<string | null>(null)
  const [betAmount, setBetAmount] = useState('20')
  const [rememberIdentity, setRememberIdentity] = useState(true)
  const [lastError, setLastError] = useState<ErrorMessage | null>(null)

  const wsUrl = useMemo(() => getWsUrl(), [])
  const connected = status === 'connected'

  const phase = snapshot?.meta?.phase || 'LOBBY'
  const meta = snapshot?.meta ?? {}

  const seats: SeatView[] = useMemo(() => {
    if (!snapshot) return []
    return Object.entries(snapshot.seats)
      .filter(([key]) => key.startsWith('seat:'))
      .map(([key, pid]) => ({
        seat: Number(key.split(':')[1]),
        pid,
        player: snapshot.players[pid],
      }))
      .sort((a, b) => a.seat - b.seat)
  }, [snapshot])

  useEffect(() => {
    rememberIdentityRef.current = rememberIdentity
  }, [rememberIdentity])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  useEffect(() => {
    tableIdRef.current = tableId
    setVisual((prev) => (prev.tableId === tableId ? prev : { ...prev, tableId }))
  }, [tableId])

  const clearAnnouncementState = useCallback(() => {
    if (announceClearTimerRef.current) {
      window.clearTimeout(announceClearTimerRef.current)
      announceClearTimerRef.current = null
    }
    announceQueueRef.current = []
    announceActiveRef.current = null
    announceActiveUntilRef.current = 0
    setAnnouncement(null)
  }, [])

  const resetSyncState = useCallback(() => {
    syncInFlightRef.current = false
    if (syncResetTimerRef.current) {
      window.clearTimeout(syncResetTimerRef.current)
      syncResetTimerRef.current = null
    }
  }, [])

  const requestSync = useCallback((force = false) => {
    if (statusRef.current !== 'connected') return
    if (!snapshotRef.current) return
    const now = Date.now()
    if (!force) {
      if (syncInFlightRef.current) return
      if (now - lastSyncAtRef.current < 250) return
    }
    lastSyncAtRef.current = now
    syncInFlightRef.current = true
    clientRef.current?.send(clientMsg.sync(lastEventIdRef.current))
    if (syncResetTimerRef.current) window.clearTimeout(syncResetTimerRef.current)
    syncResetTimerRef.current = window.setTimeout(() => {
      syncInFlightRef.current = false
      syncResetTimerRef.current = null
    }, 2000)
  }, [])

  const pumpAnnouncementQueue = useCallback(() => {
    if (announceActiveRef.current) return
    const next = announceQueueRef.current.shift()
    if (!next) return
    const duration = Math.max(0, next.durationMs ?? 3000)
    announceActiveRef.current = next
    announceActiveUntilRef.current = Date.now() + duration
    setAnnouncement(next)
    if (announceClearTimerRef.current) window.clearTimeout(announceClearTimerRef.current)
    announceClearTimerRef.current = window.setTimeout(() => {
      announceActiveRef.current = null
      setAnnouncement((current) => (current?.id === next.id ? null : current))
      pumpAnnouncementQueue()
    }, duration + 80)
  }, [])

  const enqueueAnnouncement = useCallback(
    (payload: Omit<Announcement, 'id'>, priority = false) => {
      const id = announceIdRef.current++
      const item: Announcement = { ...payload, id }
      if (priority) announceQueueRef.current.unshift(item)
      else announceQueueRef.current.push(item)
      pumpAnnouncementQueue()
    },
    [pumpAnnouncementQueue]
  )

  const enqueueGameBegin = useCallback(
    (sessionId: string) => {
      const sid = sessionId.trim()
      if (!sid) return
      if (announcedSessionIdsRef.current.has(sid)) return
      announcedSessionIdsRef.current.add(sid)
      enqueueAnnouncement(
        {
          title: 'GAME BEGIN',
          variant: 'reveal',
          tone: 'neutral',
          durationMs: 3000,
        },
        true
      )
    },
    [enqueueAnnouncement]
  )

  useEffect(() => {
    const watchdog = window.setInterval(() => {
      const current = announceActiveRef.current
      if (!current) return
      if (Date.now() <= announceActiveUntilRef.current + 200) return
      announceActiveRef.current = null
      setAnnouncement((prev) => (prev?.id === current.id ? null : prev))
      pumpAnnouncementQueue()
    }, 300)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const current = announceActiveRef.current
      if (!current) return
      if (Date.now() <= announceActiveUntilRef.current + 200) return
      announceActiveRef.current = null
      setAnnouncement((prev) => (prev?.id === current.id ? null : prev))
      pumpAnnouncementQueue()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(watchdog)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pumpAnnouncementQueue])

  useEffect(() => {
    const sid = snapshot?.meta?.session_id ? String(snapshot.meta.session_id) : ''
    const phase = snapshot?.meta?.phase ? String(snapshot.meta.phase) : 'LOBBY'
    if (!sid || phase === 'LOBBY') return
    enqueueGameBegin(sid)
  }, [snapshot?.meta?.session_id, snapshot?.meta?.phase, enqueueGameBegin])

  const resetSession = () => {
    intentionalCloseRef.current = true
    try {
      clientRef.current?.close()
    } catch {
      // ignore
    }
    clientRef.current = null

    reconnectAttemptRef.current = 0
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }

    setStatus('idle')
    setSnapshot(null)
    setEvents([])
    lastEventIdRef.current = null
    setVisual(makeInitialVisualState(tableId))
    clearAnnouncementState()
    resetSyncState()
    announcedSessionIdsRef.current.clear()
    seenEventIdsRef.current.clear()
    betResetRoundKeyRef.current = ''
    setPlayerId(null)
    setReconnectToken(null)
    setLastError(null)
    clearIdentity()
    setStage('nickname')
  }

  useEffect(() => {
    stageRef.current = stage
  }, [stage])

  useEffect(() => {
    if (!snapshot) return
    if (snapshot.meta?.phase === 'SESSION_ENDED') {
      resetSession()
      return
    }
    if (isLabPath()) return
    if (
      stageRef.current === 'admin' ||
      stageRef.current === 'anim' ||
      stageRef.current === 'trans' ||
      stageRef.current === 'layout'
    )
      return
    if (phase === 'LOBBY') setStage('lobby')
    else setStage('table')
  }, [snapshot, phase])

  useEffect(() => {
    if (!snapshot) return
    const phase = String(snapshot.meta?.phase ?? '')
    if (phase !== 'WAITING_FOR_BETS') return
    const sessionId = String(snapshot.meta?.session_id ?? '').trim()
    const roundId = String(snapshot.meta?.round_id ?? '').trim()
    const roundKey = `${sessionId}:${roundId}`
    if (roundKey === betResetRoundKeyRef.current) return
    betResetRoundKeyRef.current = roundKey
    setBetAmount('0')
  }, [snapshot])

  const scheduleReconnect = (nick: string, token: string) => {
    if (intentionalCloseRef.current) return
    if (reconnectTimerRef.current) return

    const attempt = reconnectAttemptRef.current
    const delay = Math.min(10_000, 500 * Math.pow(1.6, attempt))
    reconnectAttemptRef.current += 1

    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null
      connectWith(nick, token)
    }, delay)
  }

  const connectWith = (nick: string, token?: string | null) => {
    const trimmed = nick.trim()
    if (!trimmed) return

    const normalizedTid = normalizeRoomCode(tableIdRef.current || '')
    if (!normalizedTid) {
      const newTid = generateRoomCode()
      tableIdRef.current = newTid
      setTableId(newTid)
    } else if (normalizedTid !== tableIdRef.current) {
      tableIdRef.current = normalizedTid
      setTableId(normalizedTid)
    }

    setLastError(null)
    intentionalCloseRef.current = false
    connectNickRef.current = trimmed

    if (!clientRef.current) {
      const handlers = {
        onSnapshot: (msg: Snapshot) => {
          resetSyncState()
          setSnapshot(msg)
          setVisual((prev) => applySnapshotToVisual(msg, prev))
          // Snapshot is authoritative for current state; avoid auto-replaying
          // historic events which can cause double-animations on join.
        },
        onWelcome: (msg: WelcomeMessage) => {
          setPlayerId(msg.player_id)
          setReconnectToken(msg.reconnect_token)
          persistIdentity(
            {
              nickname: connectNickRef.current,
              reconnectToken: msg.reconnect_token,
              playerId: msg.player_id,
              tableId: tableIdRef.current,
            },
            rememberIdentityRef.current
          )
          const path = getCurrentPath()
          if (
            stageRef.current !== 'anim' &&
            stageRef.current !== 'trans' &&
            stageRef.current !== 'layout' &&
            !isLabPath(path)
          ) {
            setStage('lobby')
          }
          clientRef.current?.send(clientMsg.joinTable(tableIdRef.current))
        },
        onError: (msg: ErrorMessage) => {
          setLastError(msg)
        },
        onEvent: (msg: EventMessage) => {
          if (msg.type === 'SESSION_ENDED') {
            resetSession()
            return
          }

          if (seenEventIdsRef.current.has(msg.event_id)) {
            return
          }
          seenEventIdsRef.current.add(msg.event_id)
          lastEventIdRef.current = msg.event_id

          if (msg.type === 'PHASE_CHANGED') {
            const nextPhase = String(msg.payload?.phase ?? '')
            const onLabPath = isLabPath()
            if (
              stageRef.current !== 'admin' &&
              stageRef.current !== 'anim' &&
              stageRef.current !== 'trans' &&
              stageRef.current !== 'layout' &&
              !onLabPath
            ) {
              if (nextPhase === 'LOBBY') setStage('lobby')
              else if (nextPhase && nextPhase !== 'SESSION_ENDED') setStage('table')
            }
          }

          const eventSessionId = String(msg.session_id || snapshot?.meta?.session_id || '').trim()
          if (msg.type === 'SESSION_STARTED') {
            enqueueGameBegin(eventSessionId)
          } else if (msg.type === 'ANNOUNCEMENT') {
            const title = String(msg.payload?.title ?? '').trim()
            if (title) {
              if (title.toUpperCase() === 'GAME BEGIN') {
                enqueueGameBegin(eventSessionId)
              } else {
                const subtitleRaw = msg.payload?.subtitle
                const subtitle =
                  typeof subtitleRaw === 'string' && subtitleRaw.trim() ? subtitleRaw : undefined
                const toneRaw = String(msg.payload?.tone ?? 'neutral')
                const tone =
                  toneRaw === 'win' || toneRaw === 'dealer' || toneRaw === 'loss'
                    ? toneRaw
                    : 'neutral'
                const durationRaw = Number(msg.payload?.duration_ms)
                enqueueAnnouncement({
                  title,
                  subtitle,
                  variant: 'reveal',
                  tone,
                  durationMs: Number.isFinite(durationRaw) ? durationRaw : 3000,
                })
              }
            }
          }

          setEvents((prev) => [...prev.slice(-399), msg])
          setVisual((prev) => applyEventToVisual(msg, prev))

          if (msg.type === 'SESSION_STARTED' || msg.type === 'PHASE_CHANGED') {
            requestSync(true)
          }
        },
        onClose: () => {
          const ident = loadIdentity()
          if (ident) scheduleReconnect(ident.nickname, ident.reconnectToken)
        },
      } as const

      clientRef.current = new BlackjackWsClient(wsUrl, handlers, setStatus)
    }

    clientRef.current.connect(clientMsg.hello(trimmed, token))
  }

  const connect = () => connectWith(nickname, reconnectToken)

  const send = (payload: Record<string, unknown>) => {
    clientRef.current?.send(payload)
  }

  const onReadyToggle = () => send(clientMsg.readyToggle())
  const onBet = () => send(clientMsg.placeBet(Number(betAmount) || 0, makeId()))
  const onHit = () => send(clientMsg.action('hit', makeId()))
  const onStand = () => send(clientMsg.action('stand', makeId()))
  const onDouble = () => send(clientMsg.action('double', makeId()))
  const onNext = () => send(clientMsg.action('next', makeId()))
  const onVote = (vote: 'yes' | 'no') => send(clientMsg.voteContinue(vote, makeId()))
  const onSync = () => requestSync(true)
  const onAdminConfig = (payload: Omit<AdminConfigMsg, 'type'>) =>
    send(clientMsg.adminConfig(payload))

  const dealerCards = parseCards(snapshot?.dealer_hand?.cards)
  const dealerFaceDown = snapshot?.dealer_hand?.face_down === '1'

  useEffect(() => {
    const storedRemember = loadRememberPreference()
    if (storedRemember != null) setRememberIdentity(storedRemember)

    const path = getCurrentPath()
    if (isLabPath(path)) return
    const ident = loadIdentity()
    if (!ident) return
    setNickname(ident.nickname)
    setReconnectToken(ident.reconnectToken)
    if (ident.tableId) {
      tableIdRef.current = ident.tableId
      setTableId(ident.tableId)
    }
    if (ident.playerId) setPlayerId(ident.playerId)
    connectWith(ident.nickname, ident.reconnectToken)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    persistRememberPreference(rememberIdentity)
  }, [rememberIdentity])

  useEffect(() => {
    if (status !== 'connected') return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      requestSync(true)
    }
    const onFocus = () => requestSync(true)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [status, requestSync])

  useEffect(() => {
    if (status !== 'connected') return
    if (stage !== 'table') return
    const timer = window.setInterval(() => requestSync(false), 10_000)
    return () => window.clearInterval(timer)
  }, [status, stage, requestSync])

  useEffect(() => {
    const onOnline = () => {
      const ident = loadIdentity()
      if (!ident) return
      if (status === 'connected') {
        requestSync(true)
        return
      }
      if (status === 'connecting') return
      connectWith(ident.nickname, ident.reconnectToken)
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [status, requestSync])

  useEffect(() => {
    return () => {
      resetSyncState()
      clearAnnouncementState()
    }
  }, [clearAnnouncementState, resetSyncState])

  const reshufflePct = (() => {
    const raw = meta.reshuffle_when_remaining_pct
    const num = Number(raw)
    if (Number.isFinite(num)) {
      return `${Math.round(num * 100)}%`
    }
    return raw ?? '-'
  })()

  return {
    stage,
    setStage,
    status,
    connected,
    wsUrl,
    tableId,
    setTableId,
    nickname,
    setNickname,
    rememberIdentity,
    setRememberIdentity,
    snapshot,
    events,
    seats,
    phase,
    meta,
    reshufflePct,
    roundId: snapshot?.meta?.round_id ?? '-',
    playerId,
    reconnectToken,
    lastError,
    betAmount,
    setBetAmount,
    dealerCards,
    dealerFaceDown,
    visual,
    announcement,
    connect,
    resetSession,
    onReadyToggle,
    onBet,
    onHit,
    onStand,
    onDouble,
    onNext,
    onVote,
    onSync,
    pendingAdvanceSeat: Number(meta.pending_advance_seat || 0),
    pendingDoubleSeat: Number(meta.pending_double_seat || 0),
    onAdminConfig,
  }
}
