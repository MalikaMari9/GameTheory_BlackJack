type Props = {
  amount: number
  emphasis?: boolean
  variant?: ChipVariant
  motion?: ChipMotion
  stackSize?: 1 | 2 | 3 | 4
  compact?: boolean
}

export type ChipVariant =
  | 'casino'
  | 'classic'
  | 'royal'
  | 'neon'
  | 'obsidian'
  | 'sunset'
  | 'mint'
export type ChipMotion = 'idle' | 'pulse' | 'drop' | 'collect' | 'bounce' | 'orbit' | 'burst'
type ChipTier = 'red' | 'blue' | 'green' | 'black' | 'purple' | 'gold'

const tierFromAmount = (amount: number): ChipTier => {
  if (amount <= 10) return 'red'
  if (amount <= 20) return 'blue'
  if (amount <= 50) return 'green'
  if (amount <= 100) return 'black'
  if (amount <= 500) return 'purple'
  return 'gold'
}

export default function ChipStack({
  amount,
  emphasis,
  variant = 'casino',
  motion = 'idle',
  stackSize = 3,
  compact = false,
}: Props) {
  if (!amount) return null
  const safeCount = Math.min(4, Math.max(1, stackSize))
  const tier = tierFromAmount(amount)
  const chips = Array.from({ length: safeCount }, (_, idx) => idx)
  return (
    <div
      className={`chip-stack chip-v-${variant} chip-tier-${tier} chip-m-${motion} ${
        compact ? 'compact' : ''
      } ${emphasis ? 'emphasis' : ''}`.trim()}
      aria-label={`Bet ${amount}`}
    >
      {chips.map((idx) => (
        <div key={idx} className="chip" style={{ ['--chip-i' as any]: idx } as any} />
      ))}
      <div className="chip-label">{amount}</div>
    </div>
  )
}
