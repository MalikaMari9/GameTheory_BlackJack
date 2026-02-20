import type { VisualState } from '../../state/visual/types'
import SeatSpot from '../table/SeatSpot'

const seatPos = (seat: number) => {
  switch (seat) {
    case 1:
      return { x: 16, y: 60 }
    case 2:
      return { x: 30, y: 78 }
    case 3:
      return { x: 50, y: 86 }
    case 4:
      return { x: 70, y: 78 }
    case 5:
      return { x: 84, y: 60 }
    default:
      return { x: 50, y: 80 }
  }
}

type Props = {
  visual: VisualState
  playerId: string | null
}

export default function LobbyScene({ visual, playerId }: Props) {
  return (
    <div className="table-scene lobby">
      <div className="table-oval">
        <div className="table-glow" />
        <div className="dealer-area lobby-center">
          <div className="dealer-label">Lobby</div>
          <div className="muted small">Ready up to start (all active players).</div>
        </div>
        {visual.seats.map((s) => {
          const pos = seatPos(s.seat)
          return (
            <div
              key={s.seat}
              className="seat-pos"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <SeatSpot seat={s} isTurn={false} isYou={playerId === s.pid} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
