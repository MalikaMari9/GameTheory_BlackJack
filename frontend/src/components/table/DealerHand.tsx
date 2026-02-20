type Props = {
  cards: string[]
  faceDown: boolean
}

export default function DealerHand({ cards, faceDown }: Props) {
  return (
    <div className="cards">
      {cards.length === 0 && <span className="muted">No cards</span>}
      {cards.map((card, idx) => (
        <div className="card" key={`${card}-${idx}`}>
          {card}
        </div>
      ))}
      {faceDown && <div className="card facedown">?</div>}
    </div>
  )
}

