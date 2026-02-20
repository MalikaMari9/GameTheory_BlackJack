import { useEffect, useMemo, useRef, useState } from 'react'

import type { VisualState } from '../../state/visual/types'
import type { GtActionName, GtResponse } from '../../types/gameTheory'
import { getApiBaseUrl } from '../../ws/url'

type Props = {
  visual: VisualState
  playerId: string | null
  phase: string
  canDouble: boolean
}

const ACTIONS: GtActionName[] = ['stand', 'hit', 'double']

const actionLabel = (name: GtActionName) => {
  if (name === 'stand') return 'Stand'
  if (name === 'hit') return 'Hit'
  return 'Double'
}

const recommendationLabel = (name: GtActionName | null) => {
  if (!name) return '--'
  return actionLabel(name).toUpperCase()
}

const fmtDelta = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) return '--'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}`
}

const fmtScore = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) return '--'
  return value.toFixed(3)
}

const pct = (value: number | undefined) => `${((value ?? 0) * 100).toFixed(1)}%`

export default function GameTheoryPanel({ visual, playerId, phase, canDouble }: Props) {
  const [result, setResult] = useState<GtResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState(0)
  const requestSeqRef = useRef(0)

  const yourSeatState = useMemo(
    () => visual.seats.find((seat) => seat.pid && seat.pid === playerId) ?? null,
    [visual.seats, playerId]
  )
  const yourSeat = yourSeatState?.seat ?? 0
  const isYourTurn = phase === 'PLAYER_TURNS' && yourSeat > 0 && visual.turnSeat === yourSeat
  const dealerUpcard = useMemo(
    () => visual.dealer.hand.find((card) => Boolean(card.code))?.code ?? null,
    [visual.dealer.hand]
  )
  const playerCards = useMemo(
    () =>
      (yourSeatState?.hand ?? [])
        .map((card) => card.code)
        .filter((code): code is string => Boolean(code)),
    [yourSeatState?.hand]
  )

  const canAnalyze =
    isYourTurn &&
    Boolean(yourSeatState) &&
    playerCards.length >= 2 &&
    Boolean(dealerUpcard) &&
    (yourSeatState?.bet ?? 0) > 0

  const requestKey = useMemo(
    () =>
      [
        phase,
        visual.roundId,
        visual.turnSeat,
        yourSeatState?.seat ?? 0,
        yourSeatState?.bet ?? 0,
        yourSeatState?.bankroll ?? 0,
        visual.dealerRule || '',
        dealerUpcard || '',
        playerCards.join(','),
        canDouble ? '1' : '0',
      ].join('|'),
    [
      canDouble,
      dealerUpcard,
      phase,
      playerCards,
      visual.dealerRule,
      visual.roundId,
      visual.turnSeat,
      yourSeatState?.bankroll,
      yourSeatState?.bet,
      yourSeatState?.seat,
    ]
  )

  useEffect(() => {
    if (!canAnalyze || !yourSeatState || !dealerUpcard) {
      setLoading(false)
      setError(null)
      setResult(null)
      return
    }

    const controller = new AbortController()
    const currentSeq = requestSeqRef.current + 1
    requestSeqRef.current = currentSeq

    const run = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${getApiBaseUrl()}/strategy/blackjack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            player_cards: playerCards,
            dealer_upcard: dealerUpcard,
            bet: yourSeatState.bet,
            bankroll: yourSeatState.bankroll,
            rule: visual.dealerRule === 'H17' ? 'H17' : 'S17',
            can_double: canDouble,
            infer_can_double: false,
            risk_lambda: 1.0,
          }),
          signal: controller.signal,
        })
        if (!res.ok) {
          const raw = await res.text()
          throw new Error(raw || `HTTP ${res.status}`)
        }
        const payload = (await res.json()) as GtResponse
        if (requestSeqRef.current !== currentSeq) return
        setResult(payload)
        setUpdatedAt(Date.now())
      } catch (err) {
        if (controller.signal.aborted) return
        if (requestSeqRef.current !== currentSeq) return
        setResult(null)
        setError(err instanceof Error ? err.message : 'Failed to compute theory')
      } finally {
        if (requestSeqRef.current === currentSeq) setLoading(false)
      }
    }, 120)

    return () => {
      window.clearTimeout(run)
      controller.abort()
    }
  }, [canAnalyze, canDouble, dealerUpcard, playerCards, requestKey, visual.dealerRule, yourSeatState])

  return (
    <section className="gt-panel">
      <div className="gt-header">
        <h2>Game Theory</h2>
        <div className="tag">{loading ? 'Computing' : 'Live'}</div>
      </div>

      {!canAnalyze && <div className="muted small">Available on your turn after cards and bet are visible.</div>}
      {error && <div className="hint warn">GT error: {error}</div>}

      {result && (
        <>
          <div className="gt-recommendations">
            <div className="gt-rec">
              <span className="label">EV</span>
              <span className="value">{recommendationLabel(result.recommendations.ev_maximizer)}</span>
            </div>
            <div className="gt-rec">
              <span className="label">Risk</span>
              <span className="value">{recommendationLabel(result.recommendations.risk_averse)}</span>
            </div>
            <div className="gt-rec">
              <span className="label">Security</span>
              <span className="value">{recommendationLabel(result.recommendations.security_level)}</span>
            </div>
          </div>

          <div className="gt-table">
            <div className="gt-row head">
              <span>Action</span>
              <span>EV</span>
              <span>Utility</span>
              <span>Secure</span>
              <span>Allowed</span>
            </div>
            {ACTIONS.map((action) => {
              const row = result.actions[action]
              return (
                <div className="gt-row" key={action}>
                  <span>{actionLabel(action)}</span>
                  <span>{fmtDelta(row?.ev ?? null)}</span>
                  <span>{fmtScore(row?.utility_score ?? null)}</span>
                  <span>{fmtDelta(row?.security_score ?? null)}</span>
                  <span>{row?.allowed ? 'Yes' : 'No'}</span>
                </div>
              )
            })}
          </div>

          <div className="gt-distribution muted small">
            Dealer: 17 {pct(result.dealer_distribution[17])} | 18 {pct(result.dealer_distribution[18])} | 19{' '}
            {pct(result.dealer_distribution[19])} | 20 {pct(result.dealer_distribution[20])} | 21{' '}
            {pct(result.dealer_distribution[21])} | Bust {pct(result.dealer_distribution.bust)}
          </div>

          <div className="muted small">
            MVP model: infinite deck, 1-step hit approximation, no blackjack bonus payout.
          </div>
          {!!updatedAt && (
            <div className="muted small">Updated: {new Date(updatedAt).toLocaleTimeString()}</div>
          )}
        </>
      )}
    </section>
  )
}

