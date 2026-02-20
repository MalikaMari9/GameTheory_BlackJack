import Alert from './components/common/Alert'
import Topbar from './components/layout/Topbar'
import LobbyPage from './pages/Lobby'
import NicknamePage from './pages/Nickname'
import TablePage from './pages/Table'
import AdminPage from './pages/Admin'
import AnimationLabPage from './pages/AnimationLab'
import TransitionLabPage from './pages/TransitionLab'
import LayoutTestPage from './pages/LayoutTest'
import { useGameStore, type Stage } from './state/useGameStore'
import { useEffect, useRef, useState } from 'react'

const STAGE_CROSSFADE_MS = 500
const THEME_KEY = 'bj_theme'
type AppTheme = 'neo' | 'palace'

const isLobbyTableTransition = (from: Stage, to: Stage) =>
  (from === 'lobby' && to === 'table') || (from === 'table' && to === 'lobby')

const parseMetaInt = (raw: string | undefined, fallback = 0) => {
  const number = Number(raw)
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback
}

export default function App() {
  const game = useGameStore()
  const [theme, setTheme] = useState<AppTheme>('neo')
  const [displayStage, setDisplayStage] = useState<Stage>('nickname')
  const [stageTransition, setStageTransition] = useState<{ from: Stage; to: Stage } | null>(null)
  const stageTransitionTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const p = (window.location.pathname.replace(/\/+$/, '') || '/').toLowerCase()
    if (p === '/lobby') game.setStage('lobby')
    else if (p === '/table') game.setStage('table')
    else if (p === '/admin') game.setStage('admin')
    else if (p === '/anim') game.setStage('anim')
    else if (p === '/transtest') game.setStage('trans')
    else if (p === '/layouttest') game.setStage('layout')
    else game.setStage('nickname')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const raw = window.localStorage.getItem(THEME_KEY)
    if (raw === 'neo' || raw === 'palace') {
      setTheme(raw)
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    const path = (window.location.pathname.replace(/\/+$/, '') || '/').toLowerCase()
    if (
      game.stage === 'nickname' &&
      (path === '/anim' || path === '/transtest' || path === '/layouttest')
    )
      return
    const desired =
      game.stage === 'nickname'
        ? '/'
        : game.stage === 'lobby'
        ? '/lobby'
        : game.stage === 'admin'
        ? '/admin'
          : game.stage === 'anim'
            ? '/anim'
            : game.stage === 'trans'
              ? '/transTest'
              : game.stage === 'layout'
                ? '/layoutTest'
              : '/table'
    if (window.location.pathname !== desired) {
      window.history.replaceState(null, '', desired)
    }
  }, [game.stage])

  useEffect(() => {
    return () => {
      if (!stageTransitionTimerRef.current) return
      window.clearTimeout(stageTransitionTimerRef.current)
      stageTransitionTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    const next = game.stage
    const current = displayStage
    if (next === current) return

    if (!isLobbyTableTransition(current, next)) {
      if (stageTransitionTimerRef.current) {
        window.clearTimeout(stageTransitionTimerRef.current)
        stageTransitionTimerRef.current = null
      }
      setStageTransition(null)
      setDisplayStage(next)
      return
    }

    if (stageTransitionTimerRef.current) {
      window.clearTimeout(stageTransitionTimerRef.current)
      stageTransitionTimerRef.current = null
    }
    setStageTransition({ from: current, to: next })
    stageTransitionTimerRef.current = window.setTimeout(() => {
      setDisplayStage(next)
      setStageTransition(null)
      stageTransitionTimerRef.current = null
    }, STAGE_CROSSFADE_MS)
  }, [game.stage, displayStage])

  const renderStage = (stage: Stage) => {
    if (stage === 'nickname') {
      return (
        <NicknamePage
          nickname={game.nickname}
          rememberIdentity={game.rememberIdentity}
          setNickname={game.setNickname}
          setRememberIdentity={game.setRememberIdentity}
          tableId={game.tableId}
          setTableId={game.setTableId}
          wsUrl={game.wsUrl}
          onJoin={game.connect}
        />
      )
    }
    if (stage === 'lobby') {
      return (
        <LobbyPage
          lastError={game.lastError}
          phase={game.phase}
          playerId={game.playerId}
          tableId={game.tableId}
          onReadyToggle={game.onReadyToggle}
          onSync={game.onSync}
          onDisconnect={game.resetSession}
          onAdmin={() => game.setStage('admin')}
          visual={game.visual}
        />
      )
    }
    if (stage === 'admin') {
      return (
        <AdminPage
          meta={game.meta}
          lastError={game.lastError}
          onSync={game.onSync}
          onDisconnect={game.resetSession}
          onBack={() => game.setStage(game.phase === 'LOBBY' ? 'lobby' : 'table')}
          onSave={game.onAdminConfig}
        />
      )
    }
    if (stage === 'anim') {
      return (
        <AnimationLabPage
          onBack={() =>
            game.setStage(game.playerId ? (game.phase === 'LOBBY' ? 'lobby' : 'table') : 'nickname')
          }
        />
      )
    }
    if (stage === 'trans') {
      return (
        <TransitionLabPage
          onBack={() =>
            game.setStage(game.playerId ? (game.phase === 'LOBBY' ? 'lobby' : 'table') : 'nickname')
          }
        />
      )
    }
    if (stage === 'layout') {
      return (
        <LayoutTestPage
          onBack={() =>
            game.setStage(game.playerId ? (game.phase === 'LOBBY' ? 'lobby' : 'table') : 'nickname')
          }
        />
      )
    }
    return (
      <TablePage
        betAmount={game.betAmount}
        events={game.events}
        lastError={game.lastError}
        phase={game.phase}
        playerId={game.playerId}
        roundId={game.roundId}
        announcement={game.announcement}
        setBetAmount={game.setBetAmount}
        onBet={game.onBet}
        minBet={parseMetaInt(game.meta.min_bet, 10)}
        maxBet={parseMetaInt(game.meta.max_bet, 200)}
        onHit={game.onHit}
        onStand={game.onStand}
        onDouble={game.onDouble}
        onNext={game.onNext}
        onVote={game.onVote}
        onDisconnect={game.resetSession}
        pendingAdvanceSeat={game.pendingAdvanceSeat}
        pendingDoubleSeat={game.pendingDoubleSeat}
        visual={game.visual}
      />
    )
  }

  if (game.status === 'closed' && game.stage !== 'nickname') {
    return (
      <div className="page">
        <Topbar
          connected={game.connected}
          status={game.status}
          theme={theme}
          onThemeToggle={() => setTheme((prev) => (prev === 'neo' ? 'palace' : 'neo'))}
        />
        <section className="panel hero">
          <h1>Connection closed</h1>
          <p>Trying to reconnect automatically.</p>
          {game.lastError && <Alert error={game.lastError} />}
          <div className="hint">WS: {game.wsUrl}</div>
        </section>
      </div>
    )
  }

  return (
    <div className="page">
      <Topbar
        connected={game.connected}
        status={game.status}
        theme={theme}
        onThemeToggle={() => setTheme((prev) => (prev === 'neo' ? 'palace' : 'neo'))}
      />
      {stageTransition ? (
        <div className="stage-crossfade">
          <div className="stage-layer stage-leave">{renderStage(stageTransition.from)}</div>
          <div className="stage-layer stage-enter">{renderStage(stageTransition.to)}</div>
        </div>
      ) : (
        renderStage(displayStage)
      )}
    </div>
  )
}
