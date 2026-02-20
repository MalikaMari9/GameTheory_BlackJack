export type PlayerState = {
  seat: string
  name: string
  bankroll: string
  status: string
  bet: string
  ready?: string
  bet_submitted?: string
  hand_ids?: string
  hand_count?: string
  hand_cards?: string
}

export type Snapshot = {
  type: 'SNAPSHOT'
  meta: Record<string, string>
  seats: Record<string, string>
  players: Record<string, PlayerState>
  dealer_hand: Record<string, string>
  public_round_state: Record<string, unknown>
}

export type EventMessage = {
  event_id: string
  type: string
  session_id: string
  round_id: number
  payload: Record<string, unknown>
}

export type WelcomeMessage = {
  type: 'WELCOME'
  player_id: string
  reconnect_token: string
}

export type ErrorMessage = {
  type: 'ERROR'
  code: string
  message: string
  details?: unknown | null
}

export type SeatView = {
  seat: number
  pid: string
  player?: PlayerState
}
