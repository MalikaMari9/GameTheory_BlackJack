import type { EventMessage, Snapshot } from '../../types/messages'
import type { VisualCard, VisualPayout, VisualSeat, VisualState } from './types'

const DEFAULT_SEAT_COUNT = 5
const SHUFFLE_MS = 1500
const DEAL_GAP_MS = 320

const toInt = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

const safeJson = <T>(raw: string | undefined, fallback: T): T => {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const isReadyFlag = (value: unknown): boolean =>
  value === '1' || value === 1 || value === true || value === 'true'

type SnapshotPlayerHand = {
  hand_cards?: string
  hand_count?: string
  hand_ids?: string
}

const snapshotHand = (
  sessionId: string,
  roundId: number,
  seat: number,
  player: SnapshotPlayerHand | undefined
): VisualCard[] => {
  const rawCards = safeJson<Array<string | null>>(player?.hand_cards, [])
  const handCount = toInt(player?.hand_count, rawCards.length)
  const count = Math.max(rawCards.length, handCount)
  if (count <= 0) return []
  const handIds = safeJson<string[]>(player?.hand_ids, [])
  const handId = handIds[0] || `snap:${sessionId || 's'}:${roundId}:${seat}`
  return Array.from({ length: count }, (_, index) => {
    const code = rawCards[index]
    return makeCard(typeof code === 'string' ? code : undefined, typeof code !== 'string', {
      id: `snap:${sessionId || 's'}:${roundId}:${seat}:${index}`,
      handId,
      cardIndex: index,
      dealtAt: 0,
    })
  })
}

const getDealTimeline = (payload: Record<string, unknown>, now: number) => {
  const startedTs = toInt(payload.deal_started_ts, 0)
  const seq = toInt(payload.deal_seq, -1)
  const gapMs = toInt(payload.deal_gap_ms, DEAL_GAP_MS)
  const hasTimeline = startedTs > 0 && seq >= 0
  const rawDelay = hasTimeline ? startedTs + seq * gapMs - now : undefined
  const delayMs =
    typeof rawDelay === 'number' && rawDelay > 0 ? rawDelay : undefined
  return { hasTimeline, startedTs, seq, gapMs, delayMs }
}

const makeCard = (
  code?: string,
  faceDown?: boolean,
  extra?: Partial<
    Pick<
      VisualCard,
      'id' | 'dealtAt' | 'handId' | 'cardIndex' | 'dealDelayMs' | 'flipDelayMs'
    >
  >
): VisualCard => ({
  id: extra?.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  code,
  faceDown,
  dealtAt: extra?.dealtAt ?? Date.now(),
  handId: extra?.handId,
  cardIndex: extra?.cardIndex,
  dealDelayMs: extra?.dealDelayMs,
  flipDelayMs: extra?.flipDelayMs,
})

const upsertIndexedHandCard = (
  hand: VisualCard[],
  handId: string,
  cardIndex: number,
  code: string | undefined,
  faceDown: boolean,
  extra?: Partial<Pick<VisualCard, 'dealtAt' | 'dealDelayMs' | 'flipDelayMs'>>
): VisualCard[] => {
  const indexed: VisualCard[] = []
  let maxIndex = -1

  for (const c of hand) {
    if (c.handId !== handId) continue
    if (typeof c.cardIndex !== 'number') continue
    if (c.cardIndex < 0) continue
    if (c.cardIndex > maxIndex) maxIndex = c.cardIndex
    indexed[c.cardIndex] = c
  }

  if (cardIndex > maxIndex) maxIndex = cardIndex
  const existing = indexed[cardIndex]
  const changed = existing
    ? existing.code !== code || Boolean(existing.faceDown) !== faceDown
    : true
  const dealtAt =
    extra?.dealtAt ?? (changed ? Date.now() : existing?.dealtAt ?? Date.now())
  const dealDelayMs = extra?.dealDelayMs ?? existing?.dealDelayMs
  const flipDelayMs = extra?.flipDelayMs ?? existing?.flipDelayMs
  indexed[cardIndex] = makeCard(code, faceDown, {
    id: `h:${handId}:${cardIndex}`,
    dealtAt,
    handId,
    cardIndex,
    dealDelayMs,
    flipDelayMs,
  })

  // Fill any gaps so the renderer never sees sparse arrays/undefined entries.
  for (let i = 0; i <= maxIndex; i += 1) {
    if (indexed[i]) continue
    indexed[i] = makeCard(undefined, true, {
      id: `h:${handId}:${i}`,
      handId,
      cardIndex: i,
    })
  }

  return indexed
}

const emptySeat = (seat: number): VisualSeat => ({
  seat,
  pid: null,
  name: 'Empty',
  bankroll: 0,
  status: 'empty',
  bet: 0,
  betPlacedAt: 0,
  chipCollectAt: 0,
  ready: false,
  hand: [],
  lastPayout: null,
})

export const makeInitialVisualState = (tableId: string): VisualState => ({
  tableId,
  seatCount: DEFAULT_SEAT_COUNT,
  sessionId: '',
  roundId: 0,
  phase: 'LOBBY',
  dealerRule: '',
  turnSeat: 0,
  voteDeadlineTs: 0,
  dealStartedTs: 0,
  seats: Array.from({ length: DEFAULT_SEAT_COUNT }, (_, i) => emptySeat(i + 1)),
  dealer: { hand: [] },
})

const findSeatIndex = (seats: VisualSeat[], seat: number) =>
  seats.findIndex((s) => s.seat === seat)

const snapshotSeatCount = (snapshot: Snapshot) => {
  const seatNums = Object.keys(snapshot.seats)
    .filter((k) => k.startsWith('seat:'))
    .map((k) => toInt(k.split(':')[1], 0))
    .filter((n) => n > 0)
  const maxSeat = seatNums.length ? Math.max(...seatNums) : 0
  return Math.max(DEFAULT_SEAT_COUNT, maxSeat)
}

export const applySnapshotToVisual = (snapshot: Snapshot, prev: VisualState): VisualState => {
  const meta = snapshot.meta || {}
  const sessionId = meta.session_id ?? ''
  const roundId = toInt(meta.round_id, 0)
  const phase = meta.phase ?? 'LOBBY'
  const turnSeat = toInt(meta.turn_seat, 0)
  const voteDeadlineTs = toInt(meta.vote_deadline_ts, 0)
  const dealerRule = meta.dealer_soft_17_rule ?? prev.dealerRule ?? ''
  const dealStartedTs = toInt(meta.deal_started_ts, 0)

  const seatCount = snapshotSeatCount(snapshot)

  const prevBySeat = new Map(prev.seats.map((s) => [s.seat, s]))
  const resetHands = sessionId !== prev.sessionId || roundId !== prev.roundId

  const nextSeats: VisualSeat[] = Array.from({ length: seatCount }, (_, idx) => {
    const seat = idx + 1
    const prior = prevBySeat.get(seat) ?? emptySeat(seat)

    const pid = snapshot.seats[`seat:${seat}`] ?? null
    if (!pid) {
      return {
        ...prior,
        pid: null,
        name: 'Empty',
        bankroll: 0,
        status: 'empty',
        bet: 0,
        betPlacedAt: 0,
        chipCollectAt: 0,
        ready: false,
        hand: resetHands ? [] : prior.hand,
        lastPayout: resetHands ? null : prior.lastPayout,
      }
    }

    const p = snapshot.players[pid]
    const nextBet = toInt(p?.bet, prior.bet)
    const fromSnapshotHand = snapshotHand(sessionId, roundId, seat, p)
    return {
      ...prior,
      seat,
      pid,
      name: p?.name ?? pid,
      bankroll: toInt(p?.bankroll, prior.bankroll),
      status: p?.status ?? prior.status,
      bet: nextBet,
      betPlacedAt: resetHands ? 0 : nextBet === prior.bet ? prior.betPlacedAt : 0,
      chipCollectAt: resetHands ? 0 : nextBet > 0 ? prior.chipCollectAt : 0,
      ready: isReadyFlag(p?.ready),
      hand: fromSnapshotHand.length ? fromSnapshotHand : resetHands ? [] : prior.hand,
      lastPayout: resetHands ? null : prior.lastPayout,
    }
  })

  const dealerCards = safeJson<string[]>(snapshot.dealer_hand?.cards, [])
  const dealerHasFaceDown = toInt(snapshot.dealer_hand?.face_down, 0) === 1
  const nextDealerHand: VisualCard[] = resetHands
    ? []
    : prev.dealer.hand.map((c) => c)

  const dealerFromSnapshot: VisualCard[] = resetHands
    ? []
    : dealerCards.map((c) => makeCard(c, false, { dealtAt: 0 }))
  if (!resetHands && dealerHasFaceDown) {
    dealerFromSnapshot.push(makeCard(undefined, true, { dealtAt: 0 }))
  }
  const prevDealerKnown = resetHands
    ? 0
    : nextDealerHand.reduce((count, card) => (card.code ? count + 1 : count), 0)
  const snapshotDealerKnown = dealerCards.reduce(
    (count, card) => (typeof card === 'string' && card ? count + 1 : count),
    0
  )
  const snapshotDowngradesDealer =
    !resetHands &&
    phase === 'DEALER_TURN' &&
    prevDealerKnown >= 2 &&
    snapshotDealerKnown < prevDealerKnown &&
    dealerHasFaceDown
  const resolvedDealerHand = snapshotDowngradesDealer
    ? nextDealerHand
    : dealerFromSnapshot.length
      ? dealerFromSnapshot
      : nextDealerHand

  return {
    ...prev,
    seatCount,
    sessionId,
    roundId,
    phase,
    dealerRule,
    turnSeat,
    voteDeadlineTs,
    dealStartedTs: resetHands
      ? 0
      : dealStartedTs > 0
        ? dealStartedTs
        : prev.dealStartedTs,
    seats: nextSeats,
    dealer: {
      hand: resolvedDealerHand,
    },
  }
}

export const applyEventToVisual = (event: EventMessage, prev: VisualState): VisualState => {
  if (!event || !event.type) return prev
  if (prev.sessionId && event.session_id && event.session_id !== prev.sessionId) return prev
  if (prev.roundId && event.round_id && event.round_id !== prev.roundId) {
    // allow lobby events to pass through in round 0
    if (prev.roundId !== 0) return prev
  }

  const payload = event.payload || {}

  if (event.type === 'PHASE_CHANGED') {
    const nextPhase = String(payload.phase || '')
    return {
      ...prev,
      phase: nextPhase || prev.phase,
      turnSeat: nextPhase === 'PLAYER_TURNS' ? prev.turnSeat : prev.turnSeat,
    }
  }

  if (event.type === 'ROUND_STARTED') {
    const rule = String(payload.dealer_soft_17_rule || '')
    return { ...prev, dealerRule: rule || prev.dealerRule }
  }

  if (event.type === 'DEAL_STARTED') {
    const ts = toInt(payload.deal_started_ts, 0)
    return { ...prev, dealStartedTs: ts }
  }

  if (event.type === 'TURN_STARTED') {
    const seat = toInt(payload.seat, 0)
    return { ...prev, turnSeat: seat || prev.turnSeat }
  }

  if (event.type === 'READY_CHANGED') {
    const seat = toInt(payload.seat, 0)
    const ready = Boolean(payload.ready)
    const idx = findSeatIndex(prev.seats, seat)
    if (idx < 0) return prev
    const seats = prev.seats.slice()
    seats[idx] = { ...seats[idx], ready }
    return { ...prev, seats }
  }

  if (event.type === 'BET_PLACED' || event.type === 'BET_DOUBLED') {
    const seat = toInt(payload.seat, 0)
    const amount = toInt(payload.amount, 0)
    const idx = findSeatIndex(prev.seats, seat)
    if (idx < 0) return prev
    const seats = prev.seats.slice()
    seats[idx] = { ...seats[idx], bet: amount, betPlacedAt: Date.now(), chipCollectAt: 0 }
    return { ...prev, seats }
  }

  if (event.type === 'CHIPS_COLLECT') {
    const seats = prev.seats.map((seat) =>
      seat.bet > 0 ? { ...seat, chipCollectAt: Date.now() } : seat
    )
    return { ...prev, seats }
  }

  if (event.type === 'CARD_DEALT') {
    const to = String(payload.to || '')
    const faceDown = Boolean(payload.face_down)
    const card = typeof payload.card === 'string' ? payload.card : undefined
    const now = Date.now()

    const activeSeats = prev.seats
      .filter((s) => s.pid && s.bet > 0)
      .map((s) => s.seat)
      .sort((a, b) => a - b)

    const activeCount = activeSeats.length
    const timeline = getDealTimeline(payload as Record<string, unknown>, now)
    const dealDelayMs = timeline.delayMs
    const nextDealStartedTs =
      timeline.startedTs > 0 ? timeline.startedTs : prev.dealStartedTs

    if (to === 'dealer') {
      const dealer = { ...prev.dealer, hand: prev.dealer.hand.slice() }
      const isInitial = prev.phase === 'DEAL_INITIAL'
      const seq =
        timeline.hasTimeline
          ? timeline.seq
          : isInitial
            ? card
              ? activeCount
              : 2 * activeCount + 1
            : 0
      const fallbackDelayMs = isInitial ? SHUFFLE_MS + seq * DEAL_GAP_MS : undefined
      const finalDelayMs = dealDelayMs ?? fallbackDelayMs
      const finalDealtAt = finalDelayMs !== undefined ? now : 0

      if (!card && faceDown) {
        const backIndex = dealer.hand.findIndex((c) => c.faceDown && !c.code)
        if (backIndex >= 0) {
          const existing = dealer.hand[backIndex]
          dealer.hand[backIndex] = makeCard(existing.code, true, {
            id: existing.id,
            dealtAt: existing.dealtAt ?? finalDealtAt,
            dealDelayMs: existing.dealDelayMs ?? finalDelayMs,
            flipDelayMs: existing.flipDelayMs,
          })
          return { ...prev, dealer, dealStartedTs: nextDealStartedTs }
        }
      }
      if (card) {
        const cardIndex = dealer.hand.findIndex((c) => c.code === card)
        if (cardIndex >= 0) {
          const existing = dealer.hand[cardIndex]
          dealer.hand[cardIndex] = makeCard(card, false, {
            id: existing.id,
            dealtAt: existing.dealtAt ?? finalDealtAt,
            dealDelayMs: existing.dealDelayMs ?? finalDelayMs,
            flipDelayMs: existing.flipDelayMs,
          })
          return { ...prev, dealer, dealStartedTs: nextDealStartedTs }
        }
      }

      dealer.hand.push(
        makeCard(card, faceDown, { dealtAt: finalDealtAt, dealDelayMs: finalDelayMs })
      )
      return { ...prev, dealer, dealStartedTs: nextDealStartedTs }
    }

    const seat = toInt(payload.seat, 0)
    const idx = findSeatIndex(prev.seats, seat)
    if (idx < 0) return prev
    const seats = prev.seats.slice()
    const hand = seats[idx].hand.slice()

    const handId = typeof payload.hand_id === 'string' ? payload.hand_id : undefined
    const rawIndex = (payload as any).card_index
    const hasIndex = rawIndex !== undefined && rawIndex !== null
    const cardIndex = hasIndex ? toInt(rawIndex, -1) : -1

    if (handId && cardIndex >= 0) {
      const isInitial = prev.phase === 'DEAL_INITIAL'
      const seatRank = Math.max(0, activeSeats.indexOf(seat))
      const seq =
        timeline.hasTimeline
          ? timeline.seq
          : isInitial
            ? cardIndex === 0
              ? seatRank
              : activeCount + 1 + seatRank
            : 0
      const fallbackDelayMs = isInitial ? SHUFFLE_MS + seq * DEAL_GAP_MS : undefined
      const finalDelayMs = dealDelayMs ?? fallbackDelayMs
      const finalFlipDelayMs =
        finalDelayMs !== undefined ? finalDelayMs + 360 : undefined
      const finalDealtAt = finalDelayMs !== undefined ? now : 0

      const nextHand = upsertIndexedHandCard(hand, handId, cardIndex, card, faceDown, {
        dealtAt: finalDealtAt,
        dealDelayMs: finalDelayMs,
        flipDelayMs: finalFlipDelayMs,
      })
      seats[idx] = { ...seats[idx], hand: nextHand }
      return { ...prev, seats, dealStartedTs: nextDealStartedTs }
    }

    if (card) {
      const alreadyHasCard = hand.some((c) => c.code === card)
      if (alreadyHasCard) return { ...prev, dealStartedTs: nextDealStartedTs }
    }
    hand.push(makeCard(card, faceDown))
    seats[idx] = { ...seats[idx], hand }
    return { ...prev, seats, dealStartedTs: nextDealStartedTs }
  }

  if (event.type === 'DEALER_REVEAL_HOLE') {
    const cards = Array.isArray(payload.cards) ? (payload.cards as unknown[]) : []
    const now = Date.now()
    const timeline = getDealTimeline(payload as Record<string, unknown>, now)
    const revealDelayMs = timeline.delayMs

    if (cards.length >= 2) {
      const up = typeof cards[0] === 'string' ? cards[0] : undefined
      const hole = typeof cards[1] === 'string' ? cards[1] : undefined
      const existing = prev.dealer.hand.slice()
      const next: VisualCard[] = existing.length ? existing.slice(0, 2) : []

      if (next.length < 2) {
        next[0] = next[0] ?? makeCard(up, false)
        next[1] = next[1] ?? makeCard(undefined, true)
      }

      if (up) {
        next[0] = makeCard(up, false, {
          id: next[0]?.id,
          dealtAt: next[0]?.dealtAt,
        })
      }

      if (hole) {
        next[1] = makeCard(hole, false, {
          id: next[1]?.id,
          dealtAt: next[1]?.dealtAt,
          flipDelayMs: revealDelayMs,
        })
      }

      return { ...prev, dealer: { hand: next } }
    }

    const hand = cards
      .map((c) => (typeof c === 'string' ? makeCard(c, false) : null))
      .filter((c): c is VisualCard => Boolean(c))
    return { ...prev, dealer: { hand } }
  }

  if (event.type === 'DEALER_ACTION') {
    const action = String(payload.action || '')
    const card = typeof payload.card === 'string' ? payload.card : undefined
    if (action === 'draw' && card) {
      const now = Date.now()
      const timeline = getDealTimeline(payload as Record<string, unknown>, now)
      const dealDelayMs = timeline.delayMs
      const dealtAt = dealDelayMs !== undefined ? now : 0
      const dealer = { ...prev.dealer, hand: prev.dealer.hand.slice() }
      dealer.hand.push(makeCard(card, false, { dealtAt, dealDelayMs }))
      return { ...prev, dealer }
    }
    return prev
  }

  if (event.type === 'HANDS_REVEALED') {
    const dealer = Array.isArray(payload.dealer) ? (payload.dealer as unknown[]) : []
    const dealerHand = dealer
      .map((c) => (typeof c === 'string' ? makeCard(c, false) : null))
      .filter((c): c is VisualCard => Boolean(c))

    const players = Array.isArray(payload.players) ? (payload.players as unknown[]) : []
    const seats = prev.seats.map((s) => ({ ...s }))

    for (const item of players) {
      const seat = toInt((item as any)?.seat, 0)
      const cards = Array.isArray((item as any)?.cards) ? ((item as any).cards as unknown[]) : []
      const idx = findSeatIndex(seats, seat)
      if (idx < 0) continue
      seats[idx] = {
        ...seats[idx],
        hand: cards
          .map((c) => (typeof c === 'string' ? makeCard(c, false) : null))
          .filter((c): c is VisualCard => Boolean(c)),
      }
    }

    return { ...prev, dealer: { hand: dealerHand }, seats }
  }

  if (event.type === 'PAYOUT') {
    const seat = toInt(payload.seat, 0)
    const delta = toInt(payload.delta, 0)
    const reason = String(payload.reason || '')
    const idx = findSeatIndex(prev.seats, seat)
    if (idx < 0) return prev

    const payout: VisualPayout = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      seat,
      delta,
      reason,
      at: Date.now(),
    }

    const seats = prev.seats.slice()
    seats[idx] = { ...seats[idx], lastPayout: payout }
    return { ...prev, seats }
  }

  if (event.type === 'VOTE_STARTED') {
    const deadline = toInt(payload.deadline_ts, 0)
    return { ...prev, voteDeadlineTs: deadline }
  }

  if (event.type === 'SESSION_STARTED') {
    return {
      ...prev,
      dealer: { hand: [] },
      seats: prev.seats.map((s) => ({
        ...s,
        bet: 0,
        betPlacedAt: 0,
        chipCollectAt: 0,
        hand: [],
        lastPayout: null,
      })),
    }
  }

  if (event.type === 'VOTE_RESULT' || event.type === 'SESSION_ENDED') {
    return prev
  }

  return prev
}
