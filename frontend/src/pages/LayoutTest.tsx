import { useMemo, useState } from 'react'

type Props = {
  onBack?: () => void
}

type PreviewSize = 'desktop' | 'tablet' | 'mobile'

type SeatAnchor = {
  x: number
  y: number
}

type PreviewSeat = {
  seat: number
  name: string
  anchor: SeatAnchor
  isYou: boolean
}

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

const FULL_RING: Record<number, SeatAnchor> = {
  1: { x: 12, y: 62 },
  2: { x: 28, y: 80 },
  3: { x: 50, y: 88 },
  4: { x: 72, y: 80 },
  5: { x: 88, y: 62 },
}

const rotateFromSeat = (count: number, focusSeat: number) => {
  const seats = Array.from({ length: count }, (_, idx) => idx + 1)
  if (count <= 1) return seats
  const safeFocus = Math.min(count, Math.max(1, focusSeat))
  const start = seats.indexOf(safeFocus)
  if (start <= 0) return seats
  return [...seats.slice(start), ...seats.slice(0, start)]
}

export default function LayoutTestPage({ onBack }: Props) {
  const [playerCount, setPlayerCount] = useState(3)
  const [youSeat, setYouSeat] = useState(1)
  const [pinYouBottom, setPinYouBottom] = useState(true)
  const [showEmptyRing, setShowEmptyRing] = useState(false)
  const [previewSize, setPreviewSize] = useState<PreviewSize>('desktop')

  const maxSeat = Math.max(1, playerCount)
  const safeYouSeat = Math.min(maxSeat, Math.max(1, youSeat))

  const seats = useMemo<PreviewSeat[]>(() => {
    const anchors = ADAPTIVE_LAYOUTS[playerCount] ?? ADAPTIVE_LAYOUTS[5]
    const ids = pinYouBottom ? rotateFromSeat(playerCount, safeYouSeat) : rotateFromSeat(playerCount, 1)
    return anchors.slice(0, playerCount).map((anchor, idx) => {
      const seat = ids[idx]
      return {
        seat,
        anchor,
        isYou: seat === safeYouSeat,
        name: seat === safeYouSeat ? 'You' : `Player ${seat}`,
      }
    })
  }, [pinYouBottom, playerCount, safeYouSeat])

  const emptySeats = useMemo(() => {
    if (!showEmptyRing) return []
    const active = new Set(seats.map((item) => item.seat))
    return [1, 2, 3, 4, 5]
      .filter((seat) => !active.has(seat))
      .map((seat) => ({ seat, anchor: FULL_RING[seat] }))
  }, [seats, showEmptyRing])

  return (
    <section className="panel hero-immersive layout-lab">
      <div className="hero-bg" aria-hidden="true" />
      <div className="panel-header">
        <div>
          <h1>Layout Test Lab</h1>
          <p>Prototype adaptive seat placement before applying it to live table rendering.</p>
        </div>
        <div className="row">
          {onBack && (
            <button className="btn" onClick={onBack}>
              Back to Game
            </button>
          )}
        </div>
      </div>

      <div className="layout-lab-grid">
        <div className={`layout-stage-wrap layout-${previewSize}`}>
          <div className="table-oval layout-lab-oval">
            <div className="table-glow" />

            <div className="dealer-area layout-lab-dealer">
              <div className="dealer-label">Dealer</div>
            </div>

            {emptySeats.map((seat) => (
              <div
                key={`empty-${seat.seat}`}
                className="seat-pos layout-seat-pos"
                style={{ left: `${seat.anchor.x}%`, top: `${seat.anchor.y}%` }}
              >
                <div className="seat-spot layout-seat empty">
                  <div className="seat-header">
                    <span className="seat-name">Seat {seat.seat}</span>
                  </div>
                  <div className="seat-sub">Open</div>
                </div>
              </div>
            ))}

            {seats.map((seat) => (
              <div
                key={`active-${seat.seat}`}
                className="seat-pos layout-seat-pos"
                style={{ left: `${seat.anchor.x}%`, top: `${seat.anchor.y}%` }}
              >
                <div className={`seat-spot layout-seat ${seat.isYou ? 'you' : ''}`}>
                  <div className="seat-header">
                    <span className="seat-name">{seat.name}</span>
                    <div className="seat-badges">
                      <span className="badge">Seat {seat.seat}</span>
                    </div>
                  </div>
                  <div className="seat-sub">{seat.isYou ? 'Pinned reference seat' : 'Active player'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="layout-lab-controls">
          <div>
            <div className="label">Active Players</div>
            <div className="layout-toggle-row">
              {[1, 2, 3, 4, 5].map((count) => (
                <button
                  key={count}
                  className={`btn ${playerCount === count ? 'primary' : 'ghost'}`}
                  onClick={() => {
                    setPlayerCount(count)
                    if (youSeat > count) setYouSeat(count)
                  }}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div className="controls-row">
            <div>
              <div className="label">Your Seat</div>
              <select
                className="input"
                value={safeYouSeat}
                onChange={(e) => setYouSeat(Number(e.target.value))}
              >
                {Array.from({ length: playerCount }, (_, idx) => idx + 1).map((seat) => (
                  <option key={seat} value={seat}>
                    Seat {seat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="label">Preview Width</div>
              <div className="layout-toggle-row compact">
                <button
                  className={`btn ${previewSize === 'desktop' ? 'primary' : 'ghost'}`}
                  onClick={() => setPreviewSize('desktop')}
                >
                  Desktop
                </button>
                <button
                  className={`btn ${previewSize === 'tablet' ? 'primary' : 'ghost'}`}
                  onClick={() => setPreviewSize('tablet')}
                >
                  Tablet
                </button>
                <button
                  className={`btn ${previewSize === 'mobile' ? 'primary' : 'ghost'}`}
                  onClick={() => setPreviewSize('mobile')}
                >
                  Mobile
                </button>
              </div>
            </div>
          </div>

          <label className="layout-check">
            <input
              type="checkbox"
              checked={pinYouBottom}
              onChange={(e) => setPinYouBottom(e.target.checked)}
            />
            <span>Pin your seat to bottom anchor</span>
          </label>

          <label className="layout-check">
            <input
              type="checkbox"
              checked={showEmptyRing}
              onChange={(e) => setShowEmptyRing(e.target.checked)}
            />
            <span>Show empty seats in 5-seat ring</span>
          </label>

          <div className="hint">
            Active: <strong>{playerCount}</strong> players, You at seat{' '}
            <strong>{safeYouSeat}</strong>
          </div>
        </div>
      </div>
    </section>
  )
}
