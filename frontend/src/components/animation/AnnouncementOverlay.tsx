import type { CSSProperties } from 'react'

export type AnnouncementVariant = 'cinematic' | 'snap' | 'glitch' | 'reveal'
export type AnnouncementTone = 'neutral' | 'win' | 'dealer' | 'loss'

export type Announcement = {
  id: number
  title: string
  subtitle?: string
  variant: AnnouncementVariant
  tone?: AnnouncementTone
  durationMs?: number
  expiresAt?: number
}

type Props = {
  announcement: Announcement | null
  showBackdrop?: boolean
}

export default function AnnouncementOverlay({ announcement, showBackdrop }: Props) {
  if (!announcement) return null

  const { id, title, subtitle, variant, tone = 'neutral', durationMs } = announcement
  const style: CSSProperties = durationMs
    ? ({ ['--announce-duration' as any]: `${durationMs}ms` } as CSSProperties)
    : {}

  return (
    <div className="announcement-overlay">
      {showBackdrop && <div className="announcement-backdrop" />}
      <div key={id} className={`announcement ${variant} tone-${tone}`} style={style}>
        <div className="announcement-title" data-text={title}>
          {title}
        </div>
        {subtitle && <div className="announcement-sub">{subtitle}</div>}
      </div>
    </div>
  )
}
