type Props = {
  meta: Record<string, string>
  reshufflePct: string
}

export default function RulesGrid({ meta, reshufflePct }: Props) {
  return (
    <div className="rules-grid">
      <div className="rule-card">
        <span className="rule-label">Starting Bankroll</span>
        <span className="rule-value">{meta.starting_bankroll ?? '-'}</span>
      </div>
      <div className="rule-card">
        <span className="rule-label">Min Bet</span>
        <span className="rule-value">{meta.min_bet ?? '-'}</span>
      </div>
      <div className="rule-card">
        <span className="rule-label">Max Bet</span>
        <span className="rule-value">{meta.max_bet ?? '-'}</span>
      </div>
      <div className="rule-card">
        <span className="rule-label">Shoe Decks</span>
        <span className="rule-value">{meta.shoe_decks ?? '-'}</span>
      </div>
      <div className="rule-card">
        <span className="rule-label">Reshuffle At</span>
        <span className="rule-value">{reshufflePct}</span>
      </div>
    </div>
  )
}

