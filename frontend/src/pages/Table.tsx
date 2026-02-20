import { useEffect, useRef, useState, type CSSProperties } from 'react'

import type { Announcement } from '../components/animation/AnnouncementOverlay'
import Alert from '../components/common/Alert'
import ActionControls from '../components/table/ActionControls'
import BetControls from '../components/table/BetControls'
import EventLog from '../components/table/EventLog'
import GameTheoryPanel from '../components/table/GameTheoryPanel'
import TableScene from '../components/table/TableScene'
import VoteControls from '../components/table/VoteControls'
import type { VisualState } from '../state/visual/types'
import type { ErrorMessage, EventMessage } from '../types/messages'

type Props = {
  phase: string
  roundId: string
  playerId: string | null
  lastError: ErrorMessage | null
  betAmount: string
  setBetAmount: (v: string) => void
  onBet: () => void
  minBet: number
  maxBet: number
  onHit: () => void
  onStand: () => void
  onDouble: () => void
  onNext: () => void
  pendingAdvanceSeat: number
  pendingDoubleSeat: number
  onVote: (vote: 'yes' | 'no') => void
  onDisconnect: () => void
  events: EventMessage[]
  visual: VisualState
  announcement: Announcement | null
}

export default function TablePage({
  phase,
  roundId,
  playerId,
  lastError,
  betAmount,
  setBetAmount,
  onBet,
  minBet,
  maxBet,
  onHit,
  onStand,
  onDouble,
  onNext,
  pendingAdvanceSeat,
  pendingDoubleSeat,
  onVote,
  onDisconnect,
  events,
  visual,
  announcement,
}: Props) {
  const [showDebug, setShowDebug] = useState(false)
  const controlsRef = useRef<HTMLDivElement | null>(null)
  const [controlsReservePx, setControlsReservePx] = useState(86)
  const yourSeat = visual.seats.find((s) => s.pid && s.pid === playerId)?.seat ?? 0
  const yourSeatState = visual.seats.find((s) => s.pid && s.pid === playerId) ?? null
  const bankroll = yourSeatState?.bankroll ?? 0
  const hasSubmittedBet = Boolean(yourSeatState && yourSeatState.bet > 0)
  const pidShort = playerId ? playerId.slice(0, 8) : ''
  const isYourTurn = Boolean(yourSeat && visual.turnSeat === yourSeat)
  const canBet = phase === 'WAITING_FOR_BETS' && Boolean(yourSeatState) && !hasSubmittedBet
  const canNext = phase === 'PLAYER_TURNS' && isYourTurn && pendingAdvanceSeat === yourSeat
  const isDoubleResolving = phase === 'PLAYER_TURNS' && isYourTurn && pendingDoubleSeat === yourSeat
  const canAct = phase === 'PLAYER_TURNS' && isYourTurn && !canNext && !isDoubleResolving
  const canDouble =
    canAct &&
    Boolean(
      yourSeatState &&
        yourSeatState.hand.length === 2 &&
        yourSeatState.bet > 0 &&
        yourSeatState.bankroll >= yourSeatState.bet
    )
  const canVote = phase === 'VOTE_CONTINUE'
  const controlsMode =
    phase === 'WAITING_FOR_BETS' ? 'bet' : phase === 'PLAYER_TURNS' ? 'action' : canVote ? 'vote' : 'idle'
  const idleVisual =
    phase === 'DEAL_INITIAL'
      ? { title: 'Dealing Cards', subtitle: 'Cards are being distributed to the table.' }
      : phase === 'DEALER_TURN'
        ? { title: 'Dealer Turn', subtitle: 'Dealer is revealing and drawing cards.' }
        : phase === 'SETTLE'
          ? { title: 'Settling Bets', subtitle: 'Calculating outcomes and payouts.' }
          : { title: 'Preparing Table', subtitle: 'Setting up the next game state.' }
  const tableStyle = {
    '--table-controls-reserve': `${Math.max(74, controlsReservePx)}px`,
  } as CSSProperties

  useEffect(() => {
    const node = controlsRef.current
    if (!node) return
    const updateReserve = () => {
      const next = Math.ceil(node.getBoundingClientRect().height) + 12
      setControlsReservePx((prev) => (Math.abs(prev - next) > 1 ? next : prev))
    }
    updateReserve()
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateReserve())
      observer.observe(node)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', updateReserve)
    return () => window.removeEventListener('resize', updateReserve)
  }, [])

  return (
    <div className={`grid immersive table-page ${showDebug ? 'debug-open' : ''}`}>
      <section className="panel left immersive-left" style={tableStyle}>
        <div className="panel-header">
          <h2>Table State</h2>
          <div className="row">
            <button className="btn ghost" onClick={onDisconnect}>
              Disconnect
            </button>
            <button className="btn ghost" onClick={() => setShowDebug((v) => !v)}>
              {showDebug ? 'Hide' : 'Show'} Log
            </button>
          </div>
        </div>
        {lastError && <Alert error={lastError} />}
        <div className="meta">
          <div>
            <div className="label">Phase</div>
            <div className="value">{phase}</div>
          </div>
          <div>
            <div className="label">Round</div>
            <div className="value">{roundId}</div>
          </div>
          <div>
            <div className="label">You</div>
            <div className="value">
              {yourSeat ? `Seat ${yourSeat}` : playerId || '-'}
              {pidShort && <span className="muted small"> | {pidShort}</span>}
            </div>
          </div>
        </div>

        <TableScene visual={visual} playerId={playerId} announcement={announcement} />

        <div
          ref={controlsRef}
          className={`actions overlay table-actions mode-${controlsMode}`.trim()}
        >
          <div className="table-controls-stage">
            <div className={`control-pane ${controlsMode === 'bet' ? 'active' : 'inactive'}`.trim()}>
            <BetControls
              betAmount={betAmount}
              setBetAmount={setBetAmount}
              onBet={onBet}
              bankroll={bankroll}
              minBet={minBet}
              maxBet={maxBet}
              disabled={!canBet}
            />
            </div>
            <div className={`control-pane ${controlsMode === 'action' ? 'active' : 'inactive'}`.trim()}>
            <ActionControls
              onHit={onHit}
              onStand={onStand}
              onDouble={onDouble}
              onNext={onNext}
              showNext={canNext}
              showDouble={canDouble}
              disabled={!canAct}
            />
            </div>
            <div className={`control-pane ${controlsMode === 'vote' ? 'active' : 'inactive'}`.trim()}>
            <VoteControls
              onVote={onVote}
              disabled={!canVote}
              deadlineTs={visual.voteDeadlineTs}
              voteKey={`${roundId}:${phase}`}
            />
            </div>
            <div className={`control-pane ${controlsMode === 'idle' ? 'active' : 'inactive'}`.trim()}>
              <div className="control-idle-card">
                <div className="control-idle-title">{idleVisual.title}</div>
                <div className="control-idle-sub">{idleVisual.subtitle}</div>
                <div className="control-idle-suits" aria-hidden="true">
                  <span className="black">♣</span>
                  <span className="red">♦</span>
                  <span className="red">♥</span>
                  <span className="black">♠</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="section">
          <GameTheoryPanel
            visual={visual}
            playerId={playerId}
            phase={phase}
            canDouble={canDouble}
          />
        </section>
      </section>

      {showDebug && (
        <section className="panel right immersive-right">
          <div className="panel-header">
            <h2>Event Log</h2>
            <div className="tag">Latest</div>
          </div>
          <EventLog events={events} />
        </section>
      )}
    </div>
  )
}
