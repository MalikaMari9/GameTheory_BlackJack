import type { ErrorMessage, EventMessage, Snapshot, WelcomeMessage } from '../types/messages'

export type WsStatus = 'idle' | 'connecting' | 'connected' | 'closed'

export type WsHandlers = {
  onSnapshot: (msg: Snapshot) => void
  onWelcome: (msg: WelcomeMessage) => void
  onError: (msg: ErrorMessage) => void
  onEvent: (msg: EventMessage) => void
  onClose: () => void
}

export class BlackjackWsClient {
  private ws: WebSocket | null = null

  private readonly url: string
  private readonly handlers: WsHandlers
  private readonly onStatus: (s: WsStatus) => void

  constructor(url: string, handlers: WsHandlers, onStatus: (s: WsStatus) => void) {
    this.url = url
    this.handlers = handlers
    this.onStatus = onStatus
  }

  connect(helloPayload: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) return

    this.onStatus('connecting')
    const ws = new WebSocket(this.url)
    this.ws = ws

    ws.onopen = () => {
      this.onStatus('connected')
      ws.send(JSON.stringify(helloPayload))
    }

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data) as Snapshot | EventMessage | WelcomeMessage | ErrorMessage
      if ((msg as Snapshot).type === 'SNAPSHOT') {
        this.handlers.onSnapshot(msg as Snapshot)
        return
      }
      if ((msg as WelcomeMessage).type === 'WELCOME') {
        this.handlers.onWelcome(msg as WelcomeMessage)
        return
      }
      if ((msg as ErrorMessage).type === 'ERROR') {
        this.handlers.onError(msg as ErrorMessage)
        return
      }
      if ((msg as EventMessage).event_id) {
        this.handlers.onEvent(msg as EventMessage)
      }
    }

    ws.onclose = () => {
      this.onStatus('closed')
      this.handlers.onClose()
    }
  }

  send(payload: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify(payload))
  }

  close() {
    try {
      this.ws?.close()
    } catch {
      // ignore
    }
    this.ws = null
  }
}
