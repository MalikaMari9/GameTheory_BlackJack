type Props = {
  shuffling?: boolean
}

export default function Deck({ shuffling }: Props) {
  return (
    <div className={`deck-area ${shuffling ? 'shuffle' : ''}`.trim()} aria-label="Deck">
      <div className="deck-stack" />
      <div className="deck-stack" />
      <div className="deck-stack" />
    </div>
  )
}
