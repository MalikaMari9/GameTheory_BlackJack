import type { EventMessage } from '../../types/messages'

type Props = {
  events: EventMessage[]
}

export default function EventLog({ events }: Props) {
  return (
    <div className="log">
      {events.length === 0 && <div className="muted">No events yet.</div>}
      {events
        .slice()
        .reverse()
        .map((evt) => (
          <div className="log-item" key={evt.event_id}>
            <div className="log-type">{evt.type}</div>
            <div className="log-payload">{JSON.stringify(evt.payload)}</div>
          </div>
        ))}
    </div>
  )
}

