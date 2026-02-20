import Alert from '../components/common/Alert'
import LobbyScene from '../components/lobby/LobbyScene'
import type { ErrorMessage } from '../types/messages'
import type { VisualState } from '../state/visual/types'

type Props = {
  tableId: string
  phase: string
  playerId: string | null
  lastError: ErrorMessage | null
  onSync: () => void
  onReadyToggle: () => void
  onDisconnect: () => void
  onAdmin: () => void
  visual: VisualState
}

export default function LobbyPage({
  tableId,
  phase,
  playerId,
  lastError,
  onSync,
  onReadyToggle,
  onDisconnect,
  onAdmin,
  visual,
}: Props) {
  const yourSeat = visual.seats.find((s) => s.pid && s.pid === playerId)?.seat ?? 0
  const pidShort = playerId ? playerId.slice(0, 8) : ''
  return (
    <div className="lobby-grid immersive">
      <section className="panel lobby-panel immersive-left">
        <div className="panel-header">
          <h2>Lobby</h2>
          <div className="tag">Table {tableId}</div>
        </div>
        {lastError && <Alert error={lastError} />}
        <LobbyScene visual={visual} playerId={playerId} />
      </section>

      <section className="panel lobby-panel immersive-right">
        <div className="panel-header">
          <h2>Lobby Actions</h2>
          <div className="row">
            <button className="btn ghost" onClick={onSync}>
              Sync
            </button>
            <button className="btn ghost" onClick={onAdmin}>
              Admin
            </button>
            <button className="btn ghost" onClick={onDisconnect}>
              Disconnect
            </button>
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={onReadyToggle}>
            Ready Toggle
          </button>
        </div>
        <div className="section">
          <h3>Status</h3>
          <div className="meta">
            <div>
              <div className="label">Phase</div>
              <div className="value">{phase}</div>
            </div>
            <div>
              <div className="label">You</div>
              <div className="value">
                {yourSeat ? `Seat ${yourSeat}` : playerId || '-'}
                {pidShort && <span className="muted small"> • {pidShort}</span>}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
