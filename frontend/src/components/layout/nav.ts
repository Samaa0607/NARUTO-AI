import { BookOpen, Camera, Home, Info, Settings, Target, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  /** shorter label for medium-width top bars */
  short: string
  icon: LucideIcon
  /** decorative kanji in the mobile menu */
  kanji: string
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', short: 'Home', icon: Home, kanji: '門' },
  { to: '/live', label: 'Live Demo', short: 'Live', icon: Camera, kanji: '術' },
  { to: '/practice', label: 'Practice Mode', short: 'Practice', icon: Target, kanji: '修' },
  { to: '/library', label: 'Jutsu Library', short: 'Library', icon: BookOpen, kanji: '巻' },
  { to: '/settings', label: 'Settings', short: 'Settings', icon: Settings, kanji: '器' },
  { to: '/about', label: 'About', short: 'About', icon: Info, kanji: '志' },
]
