// Main navigation of the Konoha look (About lives in the footer).
export interface KonohaNavItem {
  to: string
  label: string
}

export const KONOHA_NAV: readonly KonohaNavItem[] = [
  { to: '/', label: 'Home' },
  { to: '/live', label: 'Live' },
  { to: '/practice', label: 'Practice' },
  { to: '/library', label: 'Jutsu' },
  { to: '/settings', label: 'Settings' },
]
