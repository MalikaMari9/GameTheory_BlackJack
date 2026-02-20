import { useEffect, useMemo, useState } from 'react'

type Props = {
  onVote: (vote: 'yes' | 'no') => void
  deadlineTs: number
  voteKey: string
  disabled?: boolean
}

const YesIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 13l4.2 4.2L19 7.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const NoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

export default function VoteControls({ onVote, deadlineTs, voteKey, disabled }: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [baselineMs, setBaselineMs] = useState(1)
  const [voted, setVoted] = useState<'yes' | 'no' | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const remaining = Math.max(0, deadlineTs - Date.now())
    setBaselineMs(Math.max(remaining, 1))
    setVoted(null)
  }, [deadlineTs, voteKey])

  const remainingMs = Math.max(0, deadlineTs - nowMs)
  const progressPct = useMemo(() => {
    if (!deadlineTs) return 0
    return Math.max(0, Math.min(100, (remainingMs / Math.max(1, baselineMs)) * 100))
  }, [baselineMs, deadlineTs, remainingMs])

  const canSubmit = !disabled && !voted
  const onPick = (vote: 'yes' | 'no') => {
    if (!canSubmit) return
    setVoted(vote)
    onVote(vote)
  }

  return (
    <div className="vote-controls">
      <div className="vote-status">
        {voted ? (
          <>Vote sent: {voted.toUpperCase()}</>
        ) : remainingMs > 0 ? (
          <>Vote ends in {(remainingMs / 1000).toFixed(1)}s</>
        ) : (
          <>Waiting for result...</>
        )}
      </div>
      <div className="vote-bar">
        <div className="vote-fill" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="row">
        <button
          className={`btn vote-btn yes ${voted === 'yes' ? 'primary' : ''}`.trim()}
          onClick={() => onPick('yes')}
          disabled={!canSubmit}
        >
          <span className="btn-icon">
            <YesIcon />
          </span>
          Vote Yes
        </button>
        <button
          className={`btn vote-btn no ${voted === 'no' ? 'primary' : ''}`.trim()}
          onClick={() => onPick('no')}
          disabled={!canSubmit}
        >
          <span className="btn-icon">
            <NoIcon />
          </span>
          Vote No
        </button>
      </div>
    </div>
  )
}
