import type { SeatView } from '../../types/messages'

type Props = {
  seats: SeatView[]
  mode: 'lobby' | 'table'
}

export default function SeatGrid({ seats, mode }: Props) {
  return (
    <div className="seat-grid">
      {seats.map((s) => (
        <div className="seat" key={s.seat}>
          <div className="seat-number">Seat {s.seat}</div>
          <div className="seat-name">{s.player?.name || 'Empty'}</div>
          {mode === 'lobby' ? (
            <div className="seat-meta">
              <span>Status: {s.player?.status ?? '-'}</span>
              <span>Bankroll: {s.player?.bankroll ?? '-'}</span>
            </div>
          ) : (
            <div className="seat-meta">
              <span>Bankroll: {s.player?.bankroll ?? '-'}</span>
              <span>Bet: {s.player?.bet ?? '-'}</span>
              <span>Status: {s.player?.status ?? '-'}</span>
            </div>
          )}
        </div>
      ))}
      {seats.length === 0 && <div className="muted">No players yet.</div>}
    </div>
  )
}

