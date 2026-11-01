// The app frame of the NARUTO redesign: the village background with Naruto and Sasuke, the centred
// NARUTO header and brush navigation, the page outlet, and a quiet footer.
import { MotionConfig } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useSettings } from '../contexts/SettingsContext'
import { KonohaBackdrop } from './shell/KonohaBackdrop'
import { KonohaHeader } from './shell/KonohaHeader'
import styles from './KonohaShell.module.css'

export function KonohaShell() {
  const { motion } = useSettings()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const previousPath = useRef(location.pathname)
  // one entrance animation per top-level section (/library and /library/:id share it)
  const section = location.pathname.split('/')[1] ?? ''

  // new page: start at the top and move keyboard / screen-reader focus to the content
  useEffect(() => {
    if (previousPath.current === location.pathname) return
    previousPath.current = location.pathname
    window.scrollTo({ top: 0, left: 0 })
    mainRef.current?.focus({ preventScroll: true })
  }, [location.pathname])

  return (
    <MotionConfig reducedMotion={motion === 'full' ? 'never' : 'always'}>
      <div className={styles.shell}>
        <a href="#main" className={styles.skip}>
          Skip to content
        </a>
        <KonohaBackdrop />
        <KonohaHeader />

        <main id="main" ref={mainRef} className={styles.main} tabIndex={-1}>
          <div key={section} className={styles.page}>
            <Outlet />
          </div>
        </main>

        <footer className={styles.footer}>
          <p className={styles.footerText}>
            Unofficial fan project for personal and educational use. Naruto and everything related to it belong to
            their rights holders.
          </p>
          <NavLink to="/about" className={styles.footerLink}>
            About
          </NavLink>
        </footer>
      </div>
    </MotionConfig>
  )
}
