export type Suit = 'S' | 'H' | 'D' | 'C'

export const suitSymbol = (suit: Suit) => {
  switch (suit) {
    case 'S':
      return '♠'
    case 'H':
      return '♥'
    case 'D':
      return '♦'
    case 'C':
      return '♣'
  }
}

export const suitColor = (suit: Suit): 'red' | 'black' =>
  suit === 'H' || suit === 'D' ? 'red' : 'black'

export const parseCardCode = (code: string): { rank: string; suit: Suit } | null => {
  if (!code || code.length < 2) return null
  const suit = code.slice(-1) as Suit
  if (!['S', 'H', 'D', 'C'].includes(suit)) return null
  const rank = code.slice(0, -1)
  if (!rank) return null
  return { rank, suit }
}

