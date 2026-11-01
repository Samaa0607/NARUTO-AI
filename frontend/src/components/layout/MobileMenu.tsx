import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { ShinobiLogo } from '../art/ShinobiLogo'
import { NAV_ITEMS } from './nav'
import { ServerStatus } from './ServerStatus'
import { ThemeToggle } from './ThemeToggle'
import styles from './MobileMenu.module.css'

export interface MobileMenuProps {
  open: boolean
  onClose: () => void
}

/** Slide-in navigation for phones and tablets (native modal <dialog>: focus trap, Esc, inert page). */
export function MobileMenu({ open, onClose }: MobileMenuProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      id="mobile-menu"
      className={styles.drawer}
      aria-label="Menu"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={styles.panel}>
        <div className={styles.head}>
          <ShinobiLogo size={28} />
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close menu">
            <X aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Main" className={styles.nav}>
          <ol>
            {NAV_ITEMS.map((item, i) => {
              const Icon = item.icon
              return (
                <li key={item.to} style={{ animationDelay: `${60 + i * 45}ms` }}>
                  <NavLink to={item.to} end={item.to === '/'} className={styles.link} onClick={onClose}>
                    <span className={styles.num} aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <Icon className={styles.icon} aria-hidden="true" />
                    <span className={styles.label}>{item.label}</span>
                    <span className={styles.kanji} aria-hidden="true">
                      {item.kanji}
                    </span>
                  </NavLink>
                </li>
              )
            })}
          </ol>
        </nav>
        <div className={styles.foot}>
          <p className={styles.footLabel}>Chakra style</p>
          <ThemeToggle variant="full" />
          <ServerStatus className={styles.status} />
        </div>
      </div>
    </dialog>
  )
}
