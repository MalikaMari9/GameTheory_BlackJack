type Props = {
  onHit: () => void
  onStand: () => void
  onDouble: () => void
  onNext: () => void
  showNext?: boolean
  showDouble?: boolean
  disabled?: boolean
}

const HitIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

const StandIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M8 20V7.5a4 4 0 118 0V20M8 12h8"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const DoubleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
    <path d="M9 9.5h3a1.5 1.5 0 010 3H9v2h4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const NextIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export default function ActionControls({
  onHit,
  onStand,
  onDouble,
  onNext,
  showNext,
  showDouble,
  disabled,
}: Props) {
  return (
    <div className="action-controls-stage">
      <div className={`action-controls-group ${showNext ? 'inactive' : 'active'}`.trim()}>
        <div className="row">
          <button className="btn action-btn hit" onClick={onHit} disabled={disabled}>
            <span className="btn-icon">
              <HitIcon />
            </span>
            Hit
          </button>
          <button className="btn action-btn stand" onClick={onStand} disabled={disabled}>
            <span className="btn-icon">
              <StandIcon />
            </span>
            Stand
          </button>
          {showDouble && (
            <button className="btn action-btn double" onClick={onDouble} disabled={disabled}>
              <span className="btn-icon">
                <DoubleIcon />
              </span>
              Double
            </button>
          )}
        </div>
      </div>
      <div className={`action-controls-group ${showNext ? 'active' : 'inactive'}`.trim()}>
        <div className="row">
          <button className="btn action-btn next" onClick={onNext}>
            <span className="btn-icon">
              <NextIcon />
            </span>
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
