# Distributed Blackjack Checklist

## M1 Scaffolding
- [ ] Initialize `backend/` FastAPI app.
- [ ] Add WS endpoint at `/ws/blackjack`.
- [ ] Create `frontend/` React app.
- [ ] Create static pages: `Nickname`, `Lobby`, `Table`.
- [ ] Connect Redis client + key builder module.

## M2 Lobby
- [ ] Implement `HELLO` / `WELCOME` + `reconnect_token`.
- [ ] Implement `JOIN_TABLE` with seat assignment + `SNAPSHOT`.
- [ ] Implement `READY_TOGGLE`.
- [ ] Implement `START_SESSION` (requires >= 2 ready).

## M3 Round Loop
- [ ] `WAITING_FOR_BETS` timer (15s).
- [ ] `PLACE_BET` (idempotent with `request_id`).
- [ ] `DEAL_INITIAL` events (including hole card).
- [ ] `PLAYER_TURNS` turn pointer + HIT/STAND validation.

## M4 Dealer + Settlement
- [ ] `DEALER_TURN` reveal + draw loop (S17/H17 per round).
- [ ] `SETTLE` payouts (dealer no bankroll).
- [ ] Reset round state and create vote phase.

## M5 Vote + End
- [ ] `VOTE_CONTINUE` timer (15s).
- [ ] No vote = NO; tie = continue.
- [ ] End session -> broadcast `SESSION_ENDED`.
- [ ] Cleanup table keys or set TTLs.

## M6 Immersion
- [ ] `eventAnimator` card slide/flip, chip throw, seat highlight.
- [ ] Reconnect sync: replay events + consistency check.

## Gap Fixes (from Plan Audit)
- [ ] Enforce betting timer auto-advance when `bet_deadline_ts` passes (no client input).
- [ ] Implement `SYNC` to replay Redis stream + send `SNAPSHOT`.
- [ ] Add reconnect grace handling (disconnect status, TTL/cleanup for stale players).
- [ ] Cleanup table keys or TTL on `SESSION_ENDED`.
- [ ] Implement `auto_end_if_no_active_bettors`.
- [ ] Implement `no_bet_behavior` config.
- [ ] Make `tie_result` and `no_vote_counts_as` config-driven.
- [ ] Align EVENT payload schema with plan (`EVENT.type` vs `event_type`).
- [ ] Add Redis locks / atomic transitions to avoid race conditions.
- [ ] Vote timeout task should support non-default `table_id`.
