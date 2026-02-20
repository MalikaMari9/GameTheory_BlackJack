export type HandValue = {
  total: number
  isSoft: boolean
  isBust: boolean
}

const rankValue = (rank: string): number => {
  if (rank === 'A') return 1
  if (rank === 'K' || rank === 'Q' || rank === 'J') return 10
  const n = Number(rank)
  if (Number.isFinite(n)) return n
  return 0
}

export const handValueFromCodes = (codes: string[]): HandValue => {
  let total = 0
  let aces = 0
  for (const code of codes) {
    if (!code || code.length < 2) continue
    const rank = code.slice(0, -1)
    if (rank === 'A') aces += 1
    total += rankValue(rank)
  }

  let isSoft = false
  while (aces > 0 && total + 10 <= 21) {
    total += 10
    aces -= 1
    isSoft = true
  }

  return { total, isSoft, isBust: total > 21 }
}

export const formatHandTotal = (hv: HandValue): string => {
  if (!hv.total) return ''
  if (hv.isBust) return `• BUST (${hv.total})`
  return `• ${hv.total}`
}

