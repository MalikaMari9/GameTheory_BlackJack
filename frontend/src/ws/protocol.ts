export type Vote = 'yes' | 'no'

export type HelloMsg = {
  type: 'HELLO'
  nickname: string
  reconnect_token?: string
}

export type JoinTableMsg = {
  type: 'JOIN_TABLE'
  table_id: string
}

export type ReadyToggleMsg = {
  type: 'READY_TOGGLE'
}

export type StartSessionMsg = {
  type: 'START_SESSION'
}

export type PlaceBetMsg = {
  type: 'PLACE_BET'
  amount: number
  request_id: string
}

export type ActionMsg = {
  type: 'ACTION'
  action: 'hit' | 'stand' | 'next' | 'double'
  request_id: string
}

export type VoteContinueMsg = {
  type: 'VOTE_CONTINUE'
  vote: Vote
  request_id: string
}

export type SyncMsg = {
  type: 'SYNC'
  last_event_id: string | null
}

export type AdminConfigMsg = {
  type: 'ADMIN_CONFIG'
  starting_bankroll?: number
  min_bet?: number
  max_bet?: number
  shoe_decks?: number
  reshuffle_when_remaining_pct?: number
}

export type ClientMsg =
  | HelloMsg
  | JoinTableMsg
  | ReadyToggleMsg
  | StartSessionMsg
  | PlaceBetMsg
  | ActionMsg
  | VoteContinueMsg
  | SyncMsg
  | AdminConfigMsg

export const clientMsg = {
  hello: (nickname: string, reconnectToken?: string | null): HelloMsg => ({
    type: 'HELLO',
    nickname,
    reconnect_token: reconnectToken || undefined,
  }),
  joinTable: (tableId: string): JoinTableMsg => ({ type: 'JOIN_TABLE', table_id: tableId }),
  readyToggle: (): ReadyToggleMsg => ({ type: 'READY_TOGGLE' }),
  startSession: (): StartSessionMsg => ({ type: 'START_SESSION' }),
  placeBet: (amount: number, requestId: string): PlaceBetMsg => ({
    type: 'PLACE_BET',
    amount,
    request_id: requestId,
  }),
  action: (action: 'hit' | 'stand' | 'next' | 'double', requestId: string): ActionMsg => ({
    type: 'ACTION',
    action,
    request_id: requestId,
  }),
  voteContinue: (vote: Vote, requestId: string): VoteContinueMsg => ({
    type: 'VOTE_CONTINUE',
    vote,
    request_id: requestId,
  }),
  sync: (lastEventId: string | null): SyncMsg => ({ type: 'SYNC', last_event_id: lastEventId }),
  adminConfig: (payload: Omit<AdminConfigMsg, 'type'>): AdminConfigMsg => ({
    type: 'ADMIN_CONFIG',
    ...payload,
  }),
} as const
