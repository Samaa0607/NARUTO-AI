// Icon and colour of each jutsu in the new look (display only).
import { Flame, Orbit, Users, Zap, type LucideIcon } from 'lucide-react'
import type { JutsuId } from '../types/protocol'

export interface JutsuLook {
  icon: LucideIcon
  /** icon colour */
  color: string
  /** soft circle behind the icon */
  tint: string
}

export const JUTSU_LOOK: Record<JutsuId, JutsuLook> = {
  fire_style: { icon: Flame, color: '#e8541a', tint: 'radial-gradient(circle at 35% 30%, #ffd2b0, #f7a77a)' },
  chidori: { icon: Zap, color: '#2f78d0', tint: 'radial-gradient(circle at 35% 30%, #e2f0ff, #a9cdf5)' },
  shadow_clone: { icon: Users, color: '#4a3b2c', tint: 'radial-gradient(circle at 35% 30%, #efe3cf, #cdb894)' },
  rasengan: { icon: Orbit, color: '#2a6fc9', tint: 'radial-gradient(circle at 35% 30%, #dcefff, #8ec2f2)' },
}
