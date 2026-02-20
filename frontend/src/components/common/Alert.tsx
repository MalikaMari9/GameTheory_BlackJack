import type { ErrorMessage } from '../../types/messages'

type Props = {
  error: ErrorMessage
}

export default function Alert({ error }: Props) {
  return (
    <div className="alert">
      <div className="alert-title">{error.code}</div>
      <div className="alert-body">{error.message}</div>
    </div>
  )
}

