import { useEffect, useMemo, useRef, useState } from 'react'

import AnnouncementOverlay, {
  type Announcement,
  type AnnouncementTone,
  type AnnouncementVariant,
} from '../components/animation/AnnouncementOverlay'
import ChipPlayground from '../components/animation/ChipPlayground'

type Props = {
  onBack?: () => void
}

type VariantMode = AnnouncementVariant | 'random'

const VARIANTS: AnnouncementVariant[] = ['cinematic', 'snap', 'glitch', 'reveal']

const clampNumber = (value: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

const normalizeName = (raw: string, fallback: string) => {
  const trimmed = raw.trim()
  return trimmed ? trimmed.toUpperCase() : fallback
}

export default function AnimationLabPage({ onBack }: Props) {
  const [playerName, setPlayerName] = useState('Player One')
  const [durationMs, setDurationMs] = useState(1800)
  const [gapMs, setGapMs] = useState(280)
  const [variantMode, setVariantMode] = useState<VariantMode>('random')
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)

  const idRef = useRef(1)
  const timersRef = useRef<number[]>([])

  const playerUpper = useMemo(
    () => normalizeName(playerName, 'PLAYER ONE'),
    [playerName]
  )

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current = []
  }

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id))
      timersRef.current = []
    }
  }, [])

  const pickVariant = () => {
    if (variantMode !== 'random') return variantMode
    return VARIANTS[Math.floor(Math.random() * VARIANTS.length)]
  }

  const showAnnouncement = (
    payload: Omit<Announcement, 'id' | 'variant' | 'durationMs'> & {
      variant?: AnnouncementVariant
      durationMs?: number
    }
  ) => {
    clearTimers()
    const safeDuration = clampNumber(payload.durationMs ?? durationMs, 600, 4000, 1800)
    const nextId = idRef.current++
    const next: Announcement = {
      id: nextId,
      title: payload.title,
      subtitle: payload.subtitle,
      tone: payload.tone,
      variant: payload.variant ?? pickVariant(),
      durationMs: safeDuration,
    }
    setAnnouncement(next)
    const clearId = window.setTimeout(() => {
      setAnnouncement((current) => (current?.id === nextId ? null : current))
    }, safeDuration)
    timersRef.current.push(clearId)
  }

  const scheduleAnnouncement = (
    payload: Omit<Announcement, 'id' | 'variant' | 'durationMs'> & {
      variant?: AnnouncementVariant
      durationMs?: number
    },
    offsetMs: number,
    totalDuration: number
  ) => {
    const nextId = idRef.current++
    const next: Announcement = {
      id: nextId,
      title: payload.title,
      subtitle: payload.subtitle,
      tone: payload.tone,
      variant: payload.variant ?? pickVariant(),
      durationMs: payload.durationMs ?? totalDuration,
    }
    const showId = window.setTimeout(() => setAnnouncement(next), offsetMs)
    const clearId = window.setTimeout(() => {
      setAnnouncement((current) => (current?.id === nextId ? null : current))
    }, offsetMs + (next.durationMs ?? totalDuration))
    timersRef.current.push(showId, clearId)
  }

  const playSequence = () => {
    clearTimers()
    const duration = clampNumber(durationMs, 600, 4000, 1800)
    const gap = clampNumber(gapMs, 0, 2000, 280)
    let offset = 0

    const sequence = [
      {
        title: 'GAME BEGIN',
        subtitle: 'PLACE YOUR BETS',
        tone: 'neutral' as AnnouncementTone,
      },
      {
        title: `${playerUpper}'S TURN`,
        subtitle: 'HIT OR STAND',
        tone: 'neutral' as AnnouncementTone,
      },
      {
        title: 'DEALER REVEALS',
        subtitle: 'HOLE CARD',
        tone: 'dealer' as AnnouncementTone,
      },
      {
        title: `${playerUpper} WINS`,
        subtitle: 'NICE HAND',
        tone: 'win' as AnnouncementTone,
      },
    ]

    for (const item of sequence) {
      scheduleAnnouncement(item, offset, duration)
      offset += duration + gap
    }
  }

  return (
    <section className="panel hero-immersive animation-lab">
      <div className="hero-bg" aria-hidden="true" />
      <div className="panel-header">
        <div>
          <h1>Animation Lab</h1>
          <p>Test announcement timing and styles before wiring into the table.</p>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={playSequence}>
            Play Sequence
          </button>
          {onBack && (
            <button className="btn" onClick={onBack}>
              Back to Game
            </button>
          )}
        </div>
      </div>

      <div className="animation-lab-grid">
        <div className="animation-lab-stage">
          <div className="table-oval lab-oval">
            <div className="table-glow" />
            <div className="lab-hint">Preview Stage</div>
            <AnnouncementOverlay announcement={announcement} showBackdrop />
          </div>
        </div>

        <div className="animation-lab-controls">
          <div>
            <div className="label">Player Name</div>
            <input
              className="input"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Player One"
            />
          </div>

          <div className="controls-row">
            <div>
              <div className="label">Duration (ms)</div>
              <input
                className="input"
                type="number"
                min={600}
                max={4000}
                value={durationMs}
                onChange={(e) =>
                  setDurationMs(clampNumber(Number(e.target.value), 600, 4000, durationMs))
                }
              />
            </div>
            <div>
              <div className="label">Gap (ms)</div>
              <input
                className="input"
                type="number"
                min={0}
                max={2000}
                value={gapMs}
                onChange={(e) => setGapMs(clampNumber(Number(e.target.value), 0, 2000, gapMs))}
              />
            </div>
          </div>

          <div>
            <div className="label">Style</div>
            <select
              className="input"
              value={variantMode}
              onChange={(e) => setVariantMode(e.target.value as VariantMode)}
            >
              <option value="random">Surprise me (random)</option>
              <option value="cinematic">Cinematic</option>
              <option value="snap">Snap</option>
              <option value="glitch">Glitch</option>
              <option value="reveal">Reveal</option>
            </select>
          </div>

          <div className="controls-row">
            <button
              className="btn"
              onClick={() =>
                showAnnouncement({
                  title: 'GAME BEGIN',
                  subtitle: 'PLACE YOUR BETS',
                  tone: 'neutral',
                })
              }
            >
              Game Begin
            </button>
            <button
              className="btn"
              onClick={() =>
                showAnnouncement({
                  title: `${playerUpper}'S TURN`,
                  subtitle: 'HIT OR STAND',
                  tone: 'neutral',
                })
              }
            >
              Player Turn
            </button>
          </div>

          <div className="controls-row">
            <button
              className="btn"
              onClick={() =>
                showAnnouncement({
                  title: 'DEALER REVEALS',
                  subtitle: 'HOLE CARD',
                  tone: 'dealer',
                })
              }
            >
              Dealer Reveals
            </button>
            <button
              className="btn primary"
              onClick={() =>
                showAnnouncement({
                  title: `${playerUpper} WINS`,
                  subtitle: 'NICE HAND',
                  tone: 'win',
                })
              }
            >
              Wins
            </button>
          </div>

          <ChipPlayground />
        </div>
      </div>
    </section>
  )
}
