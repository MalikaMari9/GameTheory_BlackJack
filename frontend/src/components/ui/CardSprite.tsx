import { parseCardCode, suitColor, suitSymbol } from '../../utils/card'

type Props = {
  code?: string
  faceDown?: boolean
  size?: 'sm' | 'md'
  animateIn?: boolean
  flip?: boolean
}

export default function CardSprite({
  code,
  faceDown,
  size = 'md',
  animateIn,
  flip,
}: Props) {
  const showBack = Boolean(faceDown) || !code
  const parsed = code ? parseCardCode(code) : null
  const rank = parsed?.rank ?? (code ?? '')
  const suit = parsed?.suit ?? null
  const color = suit ? suitColor(suit) : 'black'
  const symbol = suit ? suitSymbol(suit) : ''

  const className = [
    'poker-card',
    size === 'sm' ? 'sm' : 'md',
    showBack ? 'back' : 'front',
    color,
    animateIn ? 'deal-in' : '',
    flip ? 'flip' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className} aria-label={code || 'card'}>
      <div
        className="poker-card-inner"
        style={
          {
            ['--static-rot' as any]: `${showBack || flip ? 180 : 0}deg`,
          } as any
        }
      >
        <div className="poker-face front">
          <div className="corner tl">
            <div className="rank">{rank}</div>
            <div className="suit">{symbol}</div>
          </div>
          <div className="pip">{symbol}</div>
          <div className="corner br">
            <div className="rank">{rank}</div>
            <div className="suit">{symbol}</div>
          </div>
        </div>
        <div className="poker-face back">
          <div className="poker-card-back" />
        </div>
      </div>
    </div>
  )
}
