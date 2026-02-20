import { generateRoomCode, normalizeRoomCode } from '../utils/roomCode'

type Props = {
  nickname: string
  setNickname: (v: string) => void
  rememberIdentity: boolean
  setRememberIdentity: (v: boolean) => void
  wsUrl: string
  tableId: string
  setTableId: (v: string) => void
  onJoin: () => void
}

export default function NicknamePage({
  nickname,
  setNickname,
  rememberIdentity,
  setRememberIdentity,
  wsUrl,
  tableId,
  setTableId,
  onJoin,
}: Props) {
  const roomCode = normalizeRoomCode(tableId).slice(0, 12)
  const canJoin = nickname.trim().length > 0 && roomCode.length > 0

  return (
    <section className="panel hero hero-immersive nick-room">
      <div className="hero-bg" aria-hidden="true" />
      <div className="nick-room-head">
        <div className="nick-room-kicker">♠ BLACKJACK TABLE ♠</div>
        <h1 className="nick-room-title">Enter The Casino</h1>
        <p>Choose your room code and nickname to take a seat.</p>
      </div>

      <div className="nick-room-grid">
        <div className="nick-room-card">
          <div className="label">Room Code</div>
          <div className="row nick-room-row">
            <input
              className="input room-code-input"
              placeholder="ROOM123"
              value={roomCode}
              onChange={(e) => setTableId(normalizeRoomCode(e.target.value).slice(0, 12))}
              maxLength={12}
            />
            <button className="btn ghost" onClick={() => setTableId(generateRoomCode())}>
              Generate
            </button>
          </div>
          <div className="hint">Share this code with players joining the same table.</div>
        </div>

        <div className="nick-room-card">
          <div className="label">Nickname</div>
          <div className="row nick-room-row">
            <input
              className="input"
              placeholder="Enter nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={24}
            />
            <button className="btn primary" onClick={onJoin} disabled={!canJoin}>
              Join Table
            </button>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={rememberIdentity}
              onChange={(e) => setRememberIdentity(e.target.checked)}
            />
            Remember identity on this device
          </label>
        </div>
      </div>

      <div className="nick-room-footer">
        <span className="nick-room-suits" aria-hidden="true">
          ♣ ♦ ♥ ♠
        </span>
        <span className="hint">
          {wsUrl.startsWith('wss://') ? 'Secure live channel ready' : 'Live channel ready'}
        </span>
      </div>
    </section>
  )
}
