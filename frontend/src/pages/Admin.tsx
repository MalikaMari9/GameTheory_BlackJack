import { useEffect, useState } from 'react'
import Alert from '../components/common/Alert'
import type { ErrorMessage } from '../types/messages'
import type { AdminConfigMsg } from '../ws/protocol'

type FormState = {
  starting_bankroll: string
  min_bet: string
  max_bet: string
  shoe_decks: string
  reshuffle_when_remaining_pct: string
}

type Props = {
  meta: Record<string, string>
  lastError: ErrorMessage | null
  onSync: () => void
  onDisconnect: () => void
  onBack: () => void
  onSave: (payload: Omit<AdminConfigMsg, 'type'>) => void
}

const numberOrNull = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const num = Number(trimmed)
  if (!Number.isFinite(num)) return null
  return num
}

export default function AdminPage({
  meta,
  lastError,
  onSync,
  onDisconnect,
  onBack,
  onSave,
}: Props) {
  const [form, setForm] = useState<FormState>({
    starting_bankroll: '',
    min_bet: '',
    max_bet: '',
    shoe_decks: '',
    reshuffle_when_remaining_pct: '',
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setForm({
      starting_bankroll: meta.starting_bankroll ?? '',
      min_bet: meta.min_bet ?? '',
      max_bet: meta.max_bet ?? '',
      shoe_decks: meta.shoe_decks ?? '',
      reshuffle_when_remaining_pct: meta.reshuffle_when_remaining_pct ?? '',
    })
  }, [
    meta.starting_bankroll,
    meta.min_bet,
    meta.max_bet,
    meta.shoe_decks,
    meta.reshuffle_when_remaining_pct,
  ])

  const pending = {
    starting_bankroll: meta.pending_starting_bankroll ?? '',
    min_bet: meta.pending_min_bet ?? '',
    max_bet: meta.pending_max_bet ?? '',
    shoe_decks: meta.pending_shoe_decks ?? '',
    reshuffle_when_remaining_pct: meta.pending_reshuffle_when_remaining_pct ?? '',
  }

  const updateField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    setError(null)
    const payload: Omit<AdminConfigMsg, 'type'> = {}

    const startingBankroll = numberOrNull(form.starting_bankroll)
    if (startingBankroll === null) {
      setError('Starting bankroll must be a number.')
      return
    }
    payload.starting_bankroll = Math.floor(startingBankroll)

    const minBet = numberOrNull(form.min_bet)
    if (minBet === null) {
      setError('Min bet must be a number.')
      return
    }
    payload.min_bet = Math.floor(minBet)

    const maxBet = numberOrNull(form.max_bet)
    if (maxBet === null) {
      setError('Max bet must be a number.')
      return
    }
    payload.max_bet = Math.floor(maxBet)

    const shoeDecks = numberOrNull(form.shoe_decks)
    if (shoeDecks === null) {
      setError('Shoe decks must be a number.')
      return
    }
    payload.shoe_decks = Math.floor(shoeDecks)

    const reshufflePct = numberOrNull(form.reshuffle_when_remaining_pct)
    if (reshufflePct === null) {
      setError('Reshuffle pct must be a number between 0 and 1.')
      return
    }
    if (reshufflePct <= 0 || reshufflePct >= 1) {
      setError('Reshuffle pct must be between 0 and 1.')
      return
    }
    payload.reshuffle_when_remaining_pct = reshufflePct

    if (payload.min_bet > payload.max_bet) {
      setError('Min bet cannot exceed max bet.')
      return
    }

    onSave(payload)
  }

  return (
    <div className="grid immersive">
      <section className="panel left immersive-left">
        <div className="panel-header">
          <h2>Admin</h2>
          <div className="row">
            <button className="btn ghost" onClick={onBack}>
              Back to Lobby
            </button>
            <button className="btn ghost" onClick={onSync}>
              Sync
            </button>
            <button className="btn ghost" onClick={onDisconnect}>
              Disconnect
            </button>
          </div>
        </div>
        {lastError && <Alert error={lastError} />}
        {error && <Alert error={{ type: 'ERROR', code: 'ADMIN_FORM', message: error }} />}

        <div className="section">
          <h3>Room Config (applies next round)</h3>
          <div className="rules-grid">
            <div className="rule-card">
              <div>
                <span className="rule-label">Starting Bankroll</span>
                {pending.starting_bankroll !== '' && (
                  <div className="muted small">Pending: {pending.starting_bankroll}</div>
                )}
              </div>
              <input
                className="input small"
                type="number"
                min={0}
                value={form.starting_bankroll}
                onChange={(e) => updateField('starting_bankroll', e.target.value)}
              />
            </div>
            <div className="rule-card">
              <div>
                <span className="rule-label">Min Bet</span>
                {pending.min_bet !== '' && (
                  <div className="muted small">Pending: {pending.min_bet}</div>
                )}
              </div>
              <input
                className="input small"
                type="number"
                min={0}
                value={form.min_bet}
                onChange={(e) => updateField('min_bet', e.target.value)}
              />
            </div>
            <div className="rule-card">
              <div>
                <span className="rule-label">Max Bet</span>
                {pending.max_bet !== '' && (
                  <div className="muted small">Pending: {pending.max_bet}</div>
                )}
              </div>
              <input
                className="input small"
                type="number"
                min={0}
                value={form.max_bet}
                onChange={(e) => updateField('max_bet', e.target.value)}
              />
            </div>
            <div className="rule-card">
              <div>
                <span className="rule-label">Shoe Decks</span>
                {pending.shoe_decks !== '' && (
                  <div className="muted small">Pending: {pending.shoe_decks}</div>
                )}
              </div>
              <input
                className="input small"
                type="number"
                min={1}
                value={form.shoe_decks}
                onChange={(e) => updateField('shoe_decks', e.target.value)}
              />
            </div>
            <div className="rule-card">
              <div>
                <span className="rule-label">Reshuffle At</span>
                {pending.reshuffle_when_remaining_pct !== '' && (
                  <div className="muted small">
                    Pending: {pending.reshuffle_when_remaining_pct}
                  </div>
                )}
              </div>
              <input
                className="input small"
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={form.reshuffle_when_remaining_pct}
                onChange={(e) =>
                  updateField('reshuffle_when_remaining_pct', e.target.value)
                }
              />
            </div>
          </div>
          <div className="actions">
            <button className="btn primary" onClick={handleSave}>
              Save (Next Round)
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
