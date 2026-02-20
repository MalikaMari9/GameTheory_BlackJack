# Distributed Blackjack (FastAPI + React + Redis)

Real-time multiplayer Blackjack with a server-authoritative backend, event-driven frontend animations,
and Redis for state + ordered event streams. Prepared Feb 18, 2026.

## Overview
- Single friends-room (one table) for MVP.
- Server is the single source of truth; clients animate ordered events.
- Reconnect supported via snapshots + event replay.
- Auto-start when all active players are ready (room stays single-table).
- Per-round vote to continue/end session (no vote = NO, tie continues).
- Game Theory advisor endpoint for EV/utility/security analysis.

## Stack
- Backend: FastAPI (WebSocket)
- Frontend: React (Vite)
- Data/State: Redis (hashes + streams)

## Setup
Prereqs:
- Python 3.11
- Node.js 18+
- Docker (for Redis)

Backend (PowerShell):
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Redis (Docker):
```powershell
docker run --name bj-redis -p 6379:6379 -d redis:7
```

Frontend:
```powershell
cd frontend
npm install
npm run dev
```

Endpoints:
- HTTP health: `http://localhost:8000/health`
- HTTP strategy: `http://localhost:8000/strategy/blackjack` (POST)
- WebSocket: `ws://localhost:8000/ws/blackjack`

## Game Flow
Session: `LOBBY -> WAITING_FOR_BETS -> DEAL/PLAY -> VOTE_CONTINUE -> (next round | SESSION_ENDED)`

Round phases:
- `WAITING_FOR_BETS`
- `DEAL_INITIAL`
- `PLAYER_TURNS`
- `DEALER_TURN`
- `SETTLE`
- `VOTE_CONTINUE`

## WebSocket Protocol (MVP)

Client -> Server:
- `HELLO {nickname, reconnect_token?}`
- `JOIN_TABLE {table_id}`
- `READY_TOGGLE {}`
- `PLACE_BET {amount, request_id}`
- `ACTION {action: hit|stand|next|double, request_id}`
- `VOTE_CONTINUE {vote: yes|no, request_id}`
- `SYNC {last_event_id}`
- `ADMIN_CONFIG {starting_bankroll?, min_bet?, max_bet?, shoe_decks?, reshuffle_when_remaining_pct?}`

Server -> Client:
- `WELCOME {player_id, reconnect_token}`
- `SNAPSHOT {meta, seats, players, dealer_hand, public_round_state}`
- `EVENT {event_id, type, session_id, round_id, payload}`
- `ERROR {code, message}`

Selected event types:
`PLAYER_JOINED, PLAYER_LEFT, READY_CHANGED, SESSION_STARTED, PHASE_CHANGED, BET_PLACED,
ROUND_STARTED, CARD_DEALT, TURN_STARTED, PLAYER_ACTION, DEALER_ACTION, ANNOUNCEMENT,
PAYOUT, VOTE_STARTED, VOTE_CAST, VOTE_RESULT, SESSION_ENDED`

## Redis Data Model (Authoritative)
Keys:
- `bj:table:{tid}:meta` (phase, timers, session/round ids, turn_seat, dealer rule)
- `bj:table:{tid}:players` (set)
- `bj:table:{tid}:seats` (hash seat<->pid)
- `bj:table:{tid}:ready` (set)
- `bj:table:{tid}:player:{pid}` (hash)
- `bj:table:{tid}:hand:{hand_id}` (hash)
- `bj:table:{tid}:shoe` (string JSON list)
- `bj:table:{tid}:shoe:meta` (hash)
- `bj:table:{tid}:vote:{round_id}` (hash)
- `bj:table:{tid}:events` (stream)
- `bj:table:{tid}:req:{request_id}` (string TTL)

## Configuration Defaults (MVP)
- `shoe_decks = 6`
- `reshuffle_when_remaining_pct = 0.25`
- `dealer_soft_17_mode = "RANDOM_PER_ROUND"`
- `blackjack_payout = 3/2`
- `starting_bankroll = 1000`
- `min_bet = 10`
- `max_bet = 200`
- `bet_time_seconds = 0`
- `vote_time_seconds = 15`
- `reconnect_grace_seconds = 300`
- `min_players_to_start = 2`
- `require_ready = true`
- `allow_join_during_session = false`
- `no_bet_behavior = "SIT_OUT_ROUND"`
- `no_vote_counts_as = "NO"`
- `tie_result = "CONTINUE"`
- `auto_end_if_no_active_bettors = true`
- `show_dealer_rule = true`

## Planned Project Structure
Backend:
- `backend/app/api/ws/blackjack.py`
- `backend/app/api/http/strategy.py`
- `backend/app/domain/models/types.py`
- `backend/app/domain/rules/blackjack_rules.py`
- `backend/app/domain/engine/state_machine.py`
- `backend/app/domain/engine/validators.py`
- `backend/app/domain/strategy/gt_blackjack.py`
- `backend/app/services/table_service.py`
- `backend/app/services/round_service.py`
- `backend/app/infra/redis/{client,keys,repo,stream,locks}.py`

Frontend:
- `frontend/src/pages/{Nickname,Lobby,Table}.tsx`
- `frontend/src/components/...`
- `frontend/src/ws/{client,protocol}.ts`
- `frontend/src/state/useGameStore.ts`
- `frontend/src/animation/eventAnimator.ts`
