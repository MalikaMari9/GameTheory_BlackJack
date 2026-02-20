export type VisualCard = {
  id: string
  code?: string
  faceDown?: boolean
  dealtAt?: number
  handId?: string
  cardIndex?: number
  dealDelayMs?: number
  flipDelayMs?: number
}

export type VisualPayout = {
  id: string
  seat: number
  delta: number
  reason: string
  at: number
}

export type VisualSeat = {
  seat: number
  pid: string | null
  name: string
  bankroll: number
  status: string
  bet: number
  betPlacedAt: number
  chipCollectAt: number
  ready: boolean
  hand: VisualCard[]
  lastPayout: VisualPayout | null
}

export type VisualDealer = {
  hand: VisualCard[]
}

export type VisualState = {
  tableId: string
  seatCount: number
  sessionId: string
  roundId: number
  phase: string
  dealerRule: string
  turnSeat: number
  voteDeadlineTs: number
  dealStartedTs: number
  seats: VisualSeat[]
  dealer: VisualDealer
}
