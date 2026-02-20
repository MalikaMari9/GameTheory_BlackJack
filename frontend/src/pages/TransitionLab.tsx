import { useEffect, useRef, useState, type CSSProperties } from 'react'

type Props = {
  onBack?: () => void
}

type RoomScene = 'lobby' | 'table'
type TransitionMode =
  | 'crossfade'
  | 'fade-through'
  | 'slide'
  | 'blur-dissolve'
  | 'zoom-felt'
  | 'radial-wipe'
  | 'curtain-split'

type EasingOption = {
  label: string
  value: string
}

const MODES: Array<{ id: TransitionMode; label: string }> = [
  { id: 'crossfade', label: 'Crossfade' },
  { id: 'fade-through', label: 'Fade Through' },
  { id: 'slide', label: 'Slide + Fade' },
  { id: 'blur-dissolve', label: 'Blur Dissolve' },
  { id: 'zoom-felt', label: 'Zoom to Felt' },
  { id: 'radial-wipe', label: 'Radial Wipe' },
  { id: 'curtain-split', label: 'Curtain Split' },
]

const EASINGS: EasingOption[] = [
  { label: 'Game Ease', value: 'cubic-bezier(0.22, 0.84, 0.22, 1)' },
  { label: 'Ease In Out', value: 'ease-in-out' },
  { label: 'Ease Out', value: 'ease-out' },
  { label: 'Linear', value: 'linear' },
]

type RoomCardProps = {
  scene: RoomScene
}

function RoomCard({ scene }: RoomCardProps) {
  const isLobby = scene === 'lobby'
  return (
    <div className={`room-card ${isLobby ? 'lobby' : 'table'}`}>
      <div className="room-card-top">
        <div className="chip">{isLobby ? 'LOBBY' : 'TABLE'}</div>
        <div className="room-code">ROOM GT7K2Q</div>
      </div>
      {isLobby ? (
        <div className="room-card-content">
          <div className="room-item">
            <span>Alice</span>
            <span className="ok">Ready</span>
          </div>
          <div className="room-item">
            <span>Zam</span>
            <span className="ok">Ready</span>
          </div>
          <div className="room-item">
            <span>Malika</span>
            <span className="ok">Ready</span>
          </div>
          <div className="room-note">All players ready. Starting session…</div>
        </div>
      ) : (
        <div className="room-card-content">
          <div className="felt-mini">
            <div className="dealer-tag">Dealer: A?</div>
            <div className="seat-tag s1">Seat 1</div>
            <div className="seat-tag s2">Seat 2</div>
            <div className="seat-tag s3">Seat 3</div>
          </div>
          <div className="room-note">Waiting for bets</div>
        </div>
      )}
    </div>
  )
}

export default function TransitionLabPage({ onBack }: Props) {
  const [scene, setScene] = useState<RoomScene>('lobby')
  const [nextScene, setNextScene] = useState<RoomScene | null>(null)
  const [mode, setMode] = useState<TransitionMode>('fade-through')
  const [durationMs, setDurationMs] = useState(320)
  const [easing, setEasing] = useState(EASINGS[0].value)
  const [runId, setRunId] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const finishTimerRef = useRef<number | null>(null)

  const safeDuration = Math.min(1800, Math.max(120, Number(durationMs) || 320))

  useEffect(() => {
    return () => {
      if (finishTimerRef.current) {
        window.clearTimeout(finishTimerRef.current)
        finishTimerRef.current = null
      }
    }
  }, [])

  const runTransition = (target: RoomScene) => {
    if (target === scene || isAnimating) return
    if (finishTimerRef.current) {
      window.clearTimeout(finishTimerRef.current)
      finishTimerRef.current = null
    }
    setNextScene(target)
    setRunId((v) => v + 1)
    setIsAnimating(true)
    finishTimerRef.current = window.setTimeout(() => {
      setScene(target)
      setNextScene(null)
      setIsAnimating(false)
      finishTimerRef.current = null
    }, safeDuration + 24)
  }

  const toggleScene = () => runTransition(scene === 'lobby' ? 'table' : 'lobby')

  const stageStyle = {
    '--trans-duration': `${safeDuration}ms`,
    '--trans-ease': easing,
  } as CSSProperties

  return (
    <section className="panel hero-immersive transition-lab">
      <div className="hero-bg" aria-hidden="true" />
      <div className="panel-header">
        <div>
          <h1>Transition Test Lab</h1>
          <p>Test room transitions for Lobby → Table before wiring to live pages.</p>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={toggleScene} disabled={isAnimating}>
            {scene === 'lobby' ? 'Lobby → Table' : 'Table → Lobby'}
          </button>
          {onBack && (
            <button className="btn" onClick={onBack}>
              Back to Game
            </button>
          )}
        </div>
      </div>

      <div className="transition-lab-grid">
        <div className="transition-stage-wrap">
          <div className={`trans-stage mode-${mode} ${isAnimating ? 'is-animating' : ''}`} style={stageStyle}>
            {!isAnimating && (
              <div className="trans-layer static">
                <RoomCard scene={scene} />
              </div>
            )}
            {isAnimating && nextScene && (
              <>
                <div key={`leave-${runId}`} className="trans-layer leave">
                  <RoomCard scene={scene} />
                </div>
                <div key={`enter-${runId}`} className="trans-layer enter">
                  <RoomCard scene={nextScene} />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="transition-controls">
          <div>
            <div className="label">Method</div>
            <select
              className="input"
              value={mode}
              onChange={(e) => setMode(e.target.value as TransitionMode)}
            >
              {MODES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="controls-row">
            <div>
              <div className="label">Duration (ms)</div>
              <input
                className="input"
                type="number"
                min={120}
                max={1800}
                value={durationMs}
                onChange={(e) => setDurationMs(Number(e.target.value) || 320)}
              />
            </div>
            <div>
              <div className="label">Easing</div>
              <select className="input" value={easing} onChange={(e) => setEasing(e.target.value)}>
                {EASINGS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="controls-row">
            <button className="btn" onClick={() => runTransition('lobby')} disabled={isAnimating || scene === 'lobby'}>
              Show Lobby
            </button>
            <button className="btn primary" onClick={() => runTransition('table')} disabled={isAnimating || scene === 'table'}>
              Show Table
            </button>
          </div>

          <div className="hint">
            Current: <strong>{scene.toUpperCase()}</strong>
          </div>
        </div>
      </div>
    </section>
  )
}
