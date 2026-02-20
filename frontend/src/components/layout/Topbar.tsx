type Props = {
  connected: boolean
  status: 'idle' | 'connecting' | 'connected' | 'closed'
  theme: 'neo' | 'palace'
  onThemeToggle: () => void
}

export default function Topbar({ connected, status, theme, onThemeToggle }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" />
        <div>
          <div className="brand-title">Distributed Blackjack</div>
          <div className="brand-sub">FastAPI + Redis + React</div>
        </div>
      </div>
      <div className="topbar-controls">
        <button className="btn ghost topbar-theme-toggle" onClick={onThemeToggle}>
          Theme: {theme === 'neo' ? 'Neo' : 'Palace'}
        </button>
        <div className="status">
          <span className={`dot ${connected ? 'ok' : 'warn'}`} />
          {connected ? 'Connected' : status.toUpperCase()}
        </div>
      </div>
    </header>
  )
}
