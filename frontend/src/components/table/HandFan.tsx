import CardSprite from '../ui/CardSprite'
import type { VisualCard } from '../../state/visual/types'

type Props = {
  cards: VisualCard[]
  size?: 'sm' | 'md'
  canFlip?: boolean
}

export default function HandFan({ cards, size = 'md', canFlip }: Props) {
  return (
    <div className="hand-fan" aria-label="Hand">
      {cards.map((c) => (
        <div
          className="hand-card"
          key={c.id}
          style={
            {
              ['--deal-delay' as any]:
                c.dealDelayMs === undefined ? undefined : `${c.dealDelayMs}ms`,
              ['--flip-delay' as any]:
                c.flipDelayMs === undefined ? undefined : `${c.flipDelayMs}ms`,
            } as any
          }
        >
          <CardSprite
            code={c.code}
            faceDown={c.faceDown}
            size={size}
            animateIn={c.dealDelayMs !== undefined}
            flip={Boolean(canFlip && c.code && !c.faceDown && c.flipDelayMs !== undefined)}
          />
        </div>
      ))}
    </div>
  )
}
