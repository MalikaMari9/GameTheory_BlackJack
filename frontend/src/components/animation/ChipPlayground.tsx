import { useMemo, useState } from 'react'

import ChipStack, { type ChipMotion, type ChipVariant } from '../ui/ChipStack'

const VARIANTS: ChipVariant[] = ['casino', 'classic', 'royal', 'neon', 'obsidian', 'sunset', 'mint']
const MOTIONS: ChipMotion[] = ['idle', 'pulse', 'drop', 'collect', 'bounce', 'orbit', 'burst']

const nextAmount = (value: string, fallback: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(5, Math.min(10_000, Math.floor(parsed)))
}

export default function ChipPlayground() {
  const [amount, setAmount] = useState(120)
  const [stackSize, setStackSize] = useState<1 | 2 | 3 | 4>(3)
  const [variant, setVariant] = useState<ChipVariant>('casino')
  const [motion, setMotion] = useState<ChipMotion>('pulse')
  const [motionKey, setMotionKey] = useState(1)

  const gallery = useMemo(
    () =>
      VARIANTS.map((name, idx) => ({
        variant: name,
        motion: MOTIONS[idx % MOTIONS.length],
        amount: amount + idx * 15,
        stack: ((idx % 4) + 1) as 1 | 2 | 3 | 4,
      })),
    [amount]
  )

  const replay = (nextMotion?: ChipMotion) => {
    if (nextMotion) setMotion(nextMotion)
    setMotionKey((v) => v + 1)
  }

  return (
    <div className="chip-lab">
      <div className="chip-lab-header">
        <h3>Chip Playground</h3>
        <div className="row">
          <button className="btn ghost" onClick={() => replay()}>
            Replay
          </button>
          <button className="btn ghost" onClick={() => replay('drop')}>
            Bet Drop
          </button>
          <button className="btn ghost" onClick={() => replay('burst')}>
            Win Burst
          </button>
        </div>
      </div>

      <div className="chip-lab-controls">
        <div>
          <div className="label">Amount</div>
          <input
            className="input"
            type="number"
            min={5}
            max={10000}
            value={amount}
            onChange={(e) => setAmount(nextAmount(e.target.value, amount))}
          />
        </div>
        <div>
          <div className="label">Style</div>
          <select
            className="input"
            value={variant}
            onChange={(e) => setVariant(e.target.value as ChipVariant)}
          >
            {VARIANTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="label">Motion</div>
          <select
            className="input"
            value={motion}
            onChange={(e) => setMotion(e.target.value as ChipMotion)}
          >
            {MOTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="label">Stack</div>
          <select
            className="input"
            value={String(stackSize)}
            onChange={(e) => setStackSize(Number(e.target.value) as 1 | 2 | 3 | 4)}
          >
            <option value="1">1 chip</option>
            <option value="2">2 chips</option>
            <option value="3">3 chips</option>
            <option value="4">4 chips</option>
          </select>
        </div>
      </div>

      <div className="chip-lab-stage">
        <div key={motionKey} className="chip-lab-preview">
          <ChipStack amount={amount} stackSize={stackSize} variant={variant} motion={motion} emphasis />
        </div>
      </div>

      <div className="chip-lab-gallery">
        {gallery.map((item) => (
          <div key={item.variant} className="chip-lab-card">
            <div className="chip-lab-card-title">{item.variant}</div>
            <div className="chip-lab-card-stage">
              <ChipStack
                amount={item.amount}
                stackSize={item.stack}
                variant={item.variant}
                motion={item.motion}
                compact
              />
            </div>
            <div className="muted small">{item.motion}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
