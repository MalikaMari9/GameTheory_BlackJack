import { useState } from 'react'

import BetStacks from './BetStacks'
import ChipStack, { type ChipMotion } from '../ui/ChipStack'

type Props = {
  betAmount: string
  setBetAmount: (v: string) => void
  onBet: () => void
  bankroll: number
  minBet: number
  maxBet: number
  disabled?: boolean
}

const BASE_CHIPS = [10, 20, 25, 50, 100, 200]

const safeInt = (value: string | number | undefined, fallback = 0) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(0, Math.floor(number))
}

export default function BetControls({
  betAmount,
  setBetAmount,
  onBet,
  bankroll,
  minBet,
  maxBet,
  disabled,
}: Props) {
  const [previewMotion, setPreviewMotion] = useState<ChipMotion>('idle')
  const [previewKey, setPreviewKey] = useState(0)
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)

  const current = safeInt(betAmount, 0)
  const floorMin = Math.max(1, safeInt(minBet, 1))
  const tableMax = safeInt(maxBet, 0)
  const wallet = Math.max(0, safeInt(bankroll, 0))
  const capFromTable = tableMax > 0 ? tableMax : Number.MAX_SAFE_INTEGER
  const cap = Math.min(capFromTable, wallet)
  const bankrollBelowMin = cap < floorMin

  const chips = Array.from(new Set([floorMin, ...BASE_CHIPS]))
    .filter((amount) => amount > 0 && amount <= cap)
    .sort((a, b) => a - b)

  const canPlace = !disabled && !bankrollBelowMin && current >= floorMin && current <= cap
  const belowMin = current > 0 && current < floorMin
  const overCap = current > cap
  const validationMessage = bankrollBelowMin
    ? `Bankroll ${wallet} is below minimum bet ${floorMin}.`
    : belowMin
      ? `Bet must be at least ${floorMin}.`
      : overCap
        ? `Bet cannot exceed ${cap}.`
        : ''
  const showValidation = Boolean(validationMessage) && (attemptedSubmit || current > 0 || bankrollBelowMin)

  const triggerPreviewDrop = () => {
    setPreviewMotion('drop')
    setPreviewKey((value) => value + 1)
  }

  const setAmount = (value: number, animate = false) => {
    const next = Math.max(0, Math.floor(value))
    setBetAmount(String(next))
    if (animate && next > 0 && next !== current) {
      triggerPreviewDrop()
    }
    if (attemptedSubmit) setAttemptedSubmit(false)
  }

  const addChip = (amount: number) => {
    if (disabled) return
    setAmount(Math.min(cap, current + amount), true)
  }

  const setMin = () => setAmount(Math.min(floorMin, cap), true)
  const setAllIn = () => setAmount(cap, true)
  const clearBet = () => {
    setAmount(0)
    setPreviewMotion('idle')
  }
  const placeBet = () => {
    if (!canPlace) {
      setAttemptedSubmit(true)
      return
    }
    onBet()
  }

  return (
    <div className="bet-controls">
      <div className="bet-summary">
        <div className="bet-summary-main">
          <div className="label">Selected Bet</div>
          <div className="bet-amount">{current}</div>
        </div>
        <div className="bet-summary-preview">
          {current > 0 ? (
            <BetStacks
              key={`preview:${previewKey}:${current}:${previewMotion}`}
              amount={current}
              motion={previewMotion}
              animKey={`preview:${previewKey}`}
            />
          ) : (
            <div className="bet-preview-empty">No chips</div>
          )}
        </div>
        <div className="bet-limits">
          <div>Min {floorMin}</div>
          <div>Max {tableMax > 0 ? tableMax : '-'}</div>
          <div>Bank {wallet}</div>
        </div>
      </div>

      <div className="bet-chip-grid">
        {chips.map((amount) => (
          <button
            key={amount}
            type="button"
            className="bet-chip-btn"
            onClick={() => addChip(amount)}
            disabled={disabled}
            aria-label={`Add ${amount}`}
          >
            <span className="bet-chip-amount">{amount}</span>
            <ChipStack amount={amount} stackSize={1} compact variant="casino" motion="idle" />
          </button>
        ))}
      </div>

      <div className="bet-row">
        <button type="button" className="btn ghost" onClick={clearBet} disabled={disabled || current === 0}>
          Clear
        </button>
        <button type="button" className="btn ghost" onClick={setMin} disabled={disabled || cap <= 0}>
          Min
        </button>
        <button type="button" className="btn ghost" onClick={setAllIn} disabled={disabled || cap <= 0}>
          All-in
        </button>
        <button type="button" className="btn primary" onClick={placeBet} disabled={!canPlace}>
          Place Bet
        </button>
      </div>

      {showValidation && <div className="hint warn">{validationMessage}</div>}
    </div>
  )
}
