import type { ChipMotion } from '../ui/ChipStack'

type Props = {
  amount: number
  motion: ChipMotion
  emphasis?: boolean
  animKey?: string
}

const DENOMS = [200, 100, 50, 25, 20, 10, 5, 1]
const MAX_VISIBLE_CHIPS = 6

const expandChips = (total: number): number[] => {
  const safeTotal = Math.max(0, Math.floor(total))
  if (!safeTotal) return []
  let remaining = safeTotal
  const out: number[] = []
  for (const denom of DENOMS) {
    if (remaining < denom) continue
    const count = Math.floor(remaining / denom)
    remaining -= count * denom
    for (let index = 0; index < count; index += 1) out.push(denom)
  }
  return out
}

const tierVars = (chip: number) => {
  if (chip <= 10) {
    return { base: '#c53030', dark: '#9b2c2c', center: '#fee2e2' }
  }
  if (chip <= 20) {
    return { base: '#1d4ed8', dark: '#1e3a8a', center: '#dbeafe' }
  }
  if (chip <= 50) {
    return { base: '#15803d', dark: '#166534', center: '#dcfce7' }
  }
  if (chip <= 100) {
    return { base: '#111827', dark: '#020617', center: '#cbd5e1' }
  }
  if (chip <= 500) {
    return { base: '#6d28d9', dark: '#4c1d95', center: '#ede9fe' }
  }
  return { base: '#b45309', dark: '#7c2d12', center: '#fef3c7' }
}

export default function BetStacks({ amount, motion, emphasis, animKey = '' }: Props) {
  const chips = expandChips(amount)
  if (!chips.length) return null
  const hiddenCount = Math.max(0, chips.length - MAX_VISIBLE_CHIPS)
  const visible = chips.slice(0, MAX_VISIBLE_CHIPS).reverse()

  return (
    <div
      className={`chip-stack chip-v-casino chip-m-${motion} compact ${emphasis ? 'emphasis' : ''}`.trim()}
      aria-label={`Bet ${amount}`}
      title={`Total ${amount}`}
    >
      {visible.map((chip, index) => {
        const palette = tierVars(chip)
        return (
          <div
            key={`${animKey}:${chip}:${index}`}
            className="chip"
            style={
              {
                ['--chip-i' as any]: index,
                ['--chip-base' as any]: palette.base,
                ['--chip-base-dark' as any]: palette.dark,
                ['--chip-center' as any]: palette.center,
              } as any
            }
          />
        )
      })}
      <div className="chip-label">{amount}</div>
      {hiddenCount > 0 && <span className="bet-pile-extra">+{hiddenCount}</span>}
    </div>
  )
}
