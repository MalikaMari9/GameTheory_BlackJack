import SeatSpot from './SeatSpot'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import HandFan from './HandFan'
import Deck from './Deck'
import AnnouncementOverlay, {
  type Announcement,
} from '../animation/AnnouncementOverlay'
import type { VisualState } from '../../state/visual/types'

type SeatAnchor = { x: number; y: number }

const ADAPTIVE_LAYOUTS: Record<number, SeatAnchor[]> = {
  1: [{ x: 50, y: 86 }],
  2: [
    { x: 36, y: 82 },
    { x: 64, y: 82 },
  ],
  3: [
    { x: 24, y: 76 },
    { x: 50, y: 86 },
    { x: 76, y: 76 },
  ],
  4: [
    { x: 16, y: 68 },
    { x: 36, y: 84 },
    { x: 64, y: 84 },
    { x: 84, y: 68 },
  ],
  5: [
    { x: 12, y: 62 },
    { x: 28, y: 80 },
    { x: 50, y: 88 },
    { x: 72, y: 80 },
    { x: 88, y: 62 },
  ],
}

const DEFAULT_ANCHOR: SeatAnchor = { x: 50, y: 82 }

type Props = {
  visual: VisualState
  playerId: string | null
  announcement?: Announcement | null
}

const DEAL_TRANSITION_MS = 500

export default function TableScene({ visual, playerId, announcement }: Props) {
  const [shuffling, setShuffling] = useState(false)
  const [dealTransitionFrom, setDealTransitionFrom] = useState<VisualState | null>(null)
  const prevPhaseRef = useRef(visual.phase)
  const prevVisualRef = useRef(visual)
  const dealTransitionTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const dealStartedTs = visual.dealStartedTs
    if (!dealStartedTs) {
      setShuffling(false)
      return
    }

    const now = Date.now()
    const diff = dealStartedTs - now
    if (diff > 0) {
      setShuffling(true)
      const t = window.setTimeout(() => setShuffling(false), Math.min(diff, 1500))
      return () => window.clearTimeout(t)
    }

    setShuffling(false)
    return
  }, [visual.dealStartedTs])

  useLayoutEffect(() => {
    const prevPhase = prevPhaseRef.current
    const nextPhase = visual.phase

    if (prevPhase === 'WAITING_FOR_BETS' && nextPhase === 'DEAL_INITIAL') {
      if (dealTransitionTimerRef.current) {
        window.clearTimeout(dealTransitionTimerRef.current)
        dealTransitionTimerRef.current = null
      }
      setDealTransitionFrom(prevVisualRef.current)
      dealTransitionTimerRef.current = window.setTimeout(() => {
        setDealTransitionFrom(null)
        dealTransitionTimerRef.current = null
      }, DEAL_TRANSITION_MS)
    } else if (nextPhase !== 'DEAL_INITIAL') {
      if (dealTransitionTimerRef.current) {
        window.clearTimeout(dealTransitionTimerRef.current)
        dealTransitionTimerRef.current = null
      }
      setDealTransitionFrom(null)
    }

    prevPhaseRef.current = nextPhase
    prevVisualRef.current = visual
  }, [visual])

  useEffect(() => {
    return () => {
      if (!dealTransitionTimerRef.current) return
      window.clearTimeout(dealTransitionTimerRef.current)
      dealTransitionTimerRef.current = null
    }
  }, [])

  const renderTableOval = (sceneVisual: VisualState, sceneShuffling: boolean, showAnnouncement: boolean) => {
    const turnSeat = sceneVisual.turnSeat
    const turnName =
      turnSeat > 0 ? sceneVisual.seats.find((s) => s.seat === turnSeat)?.name : null
    const activeSeats = sceneVisual.seats
      .filter((seat) => !!seat.pid)
      .slice()
      .sort((a, b) => a.seat - b.seat)
    const fallbackSeats = sceneVisual.seats.slice().sort((a, b) => a.seat - b.seat)
    const orderedSeats = activeSeats.length > 0 ? activeSeats : fallbackSeats
    const anchors = ADAPTIVE_LAYOUTS[Math.min(5, Math.max(1, orderedSeats.length))] ?? ADAPTIVE_LAYOUTS[5]

    return (
      <div className="table-oval">
        <div className="table-glow" />
        {showAnnouncement && <AnnouncementOverlay announcement={announcement ?? null} showBackdrop />}

        <div className="dealer-area">
          <div className="dealer-label">
            Dealer
            {sceneVisual.dealerRule && <span className="tag small">{sceneVisual.dealerRule}</span>}
          </div>
          {sceneVisual.phase === 'PLAYER_TURNS' && turnName && (
            <div className="turn-indicator">Turn: {turnName}</div>
          )}
          <HandFan cards={sceneVisual.dealer.hand} size="md" canFlip />
        </div>

        <Deck shuffling={sceneShuffling} />

        {orderedSeats.map((s, idx) => {
          const pos = anchors[idx] ?? anchors[anchors.length - 1] ?? DEFAULT_ANCHOR
          return (
            <div
              key={s.seat}
              className={`seat-pos seat-count-${orderedSeats.length}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <SeatSpot
                seat={s}
                isTurn={sceneVisual.phase === 'PLAYER_TURNS' && sceneVisual.turnSeat === s.seat}
                isYou={playerId === s.pid}
              />
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={`table-scene ${announcement ? 'paused' : ''}`.trim()}>
      {dealTransitionFrom ? (
        <div className="table-phase-crossfade">
          <div className="phase-layer phase-leave">
            {renderTableOval(dealTransitionFrom, false, false)}
          </div>
          <div className="phase-layer phase-enter">{renderTableOval(visual, shuffling, true)}</div>
        </div>
      ) : (
        renderTableOval(visual, shuffling, true)
      )}
      </div>
  )
}
