// The app frame: animated background, top bar (desktop) / menu drawer (phones, tablets), page
// outlet with a soft entrance per section, and the footer.
import { MotionConfig, motion as m } from 'framer-motion'
import { Menu } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useSettings } from '../../contexts/SettingsContext'
import { ChakraBackground } from '../art/ChakraBackground'
import { ShinobiLogo } from '../art/ShinobiLogo'
import { ThemeShift } from '../art/ThemeShift'
import { MobileMenu } from './MobileMenu'
import { NAV_ITEMS } from './nav'
import { ServerStatus } from './ServerStatus'
import { ThemeToggle } from './ThemeToggle'
import styles from './AppShell.module.css'

function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])
  return scrolled
}

export function AppShell() {
  const { motion } = useSettings()
  const location = useLocation()
  const scrolled = useScrolled()
  const [menuOpen, setMenuOpen] = useState(false)
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
        {/* calmer particles behind the camera pages: the browser also encodes camera frames there */}
        <ChakraBackground calm={section === 'live' || section === 'practice'} />
        <ThemeShift />

        <header className={[styles.topbar, scrolled ? styles.scrolled : ''].filter(Boolean).join(' ')}>
          <div className={styles.bar}>
            <Link to="/" className={styles.brand} aria-label="SHINOBI AI home">
              <ShinobiLogo size={34} />
            </Link>

            <nav aria-label="Main" className={styles.nav}>
              {NAV_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className={styles.link}>
                  {({ isActive }) => (
                    <>
                      <span className={styles.full}>{item.label}</span>
                      <span className={styles.short} aria-hidden="true">
                        {item.short}
                      </span>
                      {item.to === '/live' ? <span className={styles.liveDot} aria-hidden="true" /> : null}
                      {isActive ? (
                        <m.span
                          layoutId="nav-active"
                          className={styles.indicator}
                          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                        />
                      ) : null}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className={styles.tools}>
              <ServerStatus className={styles.status} responsive />
              <ThemeToggle className={styles.theme} />
              <button
                type="button"
                className={styles.menuButton}
                aria-label="Open menu"
                aria-haspopup="dialog"
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                onClick={() => setMenuOpen(true)}
              >
                <Menu aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

        <main id="main" ref={mainRef} className={styles.main} tabIndex={-1}>
          <div key={section} className={styles.page}>
            <Outlet />
          </div>
        </main>

        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <ShinobiLogo size={22} />
            <p className={styles.disclaimer}>
              Unofficial fan project for personal and educational use. Naruto and everything related to it belong
              to their rights holders.
            </p>
            <nav aria-label="Footer" className={styles.footerNav}>
              <Link to="/library">Jutsu Library</Link>
              <Link to="/about">About &amp; credits</Link>
              <Link to="/settings">Settings</Link>
            </nav>
          </div>
        </footer>
      </div>
    </MotionConfig>
  )
}
