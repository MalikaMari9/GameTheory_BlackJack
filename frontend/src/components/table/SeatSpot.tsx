import type { ChipMotion } from '../ui/ChipStack'
import BetStacks from './BetStacks'
import HandFan from './HandFan'
import type { VisualSeat } from '../../state/visual/types'
import { formatHandTotal, handValueFromCodes } from '../../utils/blackjack'

type Props = {
  seat: VisualSeat
  isTurn: boolean
  isYou: boolean
}

export default function SeatSpot({ seat, isTurn, isYou }: Props) {
  const empty = seat.pid == null
  const chipMotion: ChipMotion =
    seat.chipCollectAt > 0
      ? 'collect'
      : seat.lastPayout && seat.lastPayout.delta > 0
      ? 'burst'
      : seat.betPlacedAt > 0
        ? 'drop'
        : 'idle'
  const chipAnimKey = `${seat.betPlacedAt}-${seat.chipCollectAt}-${seat.lastPayout?.id ?? 'none'}-${seat.bet}`
  const className = [
    'seat-spot',
    empty ? 'empty' : 'occupied',
    isTurn ? 'turn' : '',
    isYou ? 'you' : '',
    seat.status === 'disconnected' ? 'disconnected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className}>
      <div className="seat-header">
        <div className="seat-name">
          {empty ? `Seat ${seat.seat}` : seat.name}
          {!empty && isYou && (() => {
            const visibleCodes = seat.hand
              .map((c) => c.code)
              .filter((c): c is string => Boolean(c))
            if (visibleCodes.length < 2) return null

            let lastCard = seat.hand[seat.hand.length - 1]
            for (const c of seat.hand) {
              const curIdx = typeof c.cardIndex === 'number' ? c.cardIndex : -1
              const bestIdx = typeof lastCard?.cardIndex === 'number' ? lastCard.cardIndex : -1
              if (curIdx > bestIdx) lastCard = c
            }

            const delayBase = lastCard?.flipDelayMs ?? lastCard?.dealDelayMs
            const showDelayed = typeof delayBase === 'number' && delayBase > 0
            const totalDelayMs = showDelayed ? delayBase + 420 : 0
            return (
              <span
                className={`seat-total ${showDelayed ? 'delayed' : ''}`.trim()}
                style={
                  showDelayed
                    ? ({ ['--total-delay' as any]: `${totalDelayMs}ms` } as any)
                    : undefined
                }
              >
                {formatHandTotal(handValueFromCodes(visibleCodes))}
              </span>
            )
          })()}
        </div>
        {!empty && (
          <div className="seat-badges">
            {isTurn && <span className="badge turn">TURN</span>}
            {seat.ready && <span className="badge ready">READY</span>}
            {seat.status === 'broke' && <span className="badge warn">BROKE</span>}
            {seat.status === 'disconnected' && (
              <span className="badge warn">DC</span>
            )}
          </div>
        )}
      </div>

      {!empty && (
        <div className="seat-sub">
          <span className="seat-chip">Bank: {seat.bankroll}</span>
        </div>
      )}

      {!empty && seat.hand.length > 0 && <HandFan cards={seat.hand} size="sm" canFlip={isYou} />}

      {!empty && seat.bet > 0 && (
        <BetStacks key={chipAnimKey} amount={seat.bet} emphasis={isTurn} motion={chipMotion} animKey={chipAnimKey} />
      )}

      {!empty && seat.lastPayout && (
        <div
          className={`payout-float ${seat.lastPayout.delta >= 0 ? 'pos' : 'neg'}`}
          key={seat.lastPayout.id}
        >
          {seat.lastPayout.delta >= 0 ? '+' : ''}
          {seat.lastPayout.delta} ({seat.lastPayout.reason})
        </div>
      )}
    </div>
  )
}
