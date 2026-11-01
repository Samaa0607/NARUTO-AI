import { PenTool, Stamp } from 'lucide-react'
import { Badge } from './Badge'

export interface SequenceBadgeProps {
  /** JutsuInfo.official */
  official: boolean
  size?: 'sm' | 'md'
  className?: string
}

/** The very clear Official / Custom label every jutsu must carry. */
export function SequenceBadge({ official, size = 'sm', className }: SequenceBadgeProps) {
  return official ? (
    <Badge tone="official" size={size} icon={<Stamp aria-hidden="true" />} className={className}>
      Official seal sequence
    </Badge>
  ) : (
    <Badge tone="custom" size={size} icon={<PenTool aria-hidden="true" />} className={className}>
      Custom SHINOBI AI sequence
    </Badge>
  )
}
