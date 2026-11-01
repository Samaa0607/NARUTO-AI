// Centred NARUTO header of the reference: leaf emblem | wordmark on an orange brush swash, and the
// hand-lettered navigation under it (active item orange with a small brush underline), and the small
// background-music control at the top right.
import { motion as m } from 'framer-motion'
import { Link, NavLink } from 'react-router-dom'
import { LeafEmblem } from '../LeafEmblem'
import { BrushSwash } from './BrushSwash'
import { MusicControl } from './MusicControl'
import { KONOHA_NAV } from './nav'
import styles from './KonohaHeader.module.css'

function InkUnderline() {
  return (
    <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M1,8.4 C10,5.6 30,4.2 58,3.6 C76,3.2 90,3 99,2.6 C88,4.6 70,6.4 50,7.8 C30,9.2 14,10.4 3,11 Z" />
    </svg>
  )
}

export function KonohaHeader() {
  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand} aria-label="NARUTO, home">
        <LeafEmblem className={styles.emblem} />
        <span className={styles.divider} aria-hidden="true" />
        <span className={styles.word} aria-hidden="true">
          <BrushSwash className={styles.swash} />
          <span className={styles.wordText}>NARUTO</span>
        </span>
      </Link>

      <nav aria-label="Main" className={styles.nav}>
        <ul className={styles.list}>
          {KONOHA_NAV.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === '/'} className={styles.link}>
                {({ isActive }) => (
                  <>
                    <span className={styles.label}>{item.label}</span>
                    {isActive ? (
                      <m.span
                        layoutId="konoha-nav-ink"
                        className={styles.ink}
                        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                      >
                        <InkUnderline />
                      </m.span>
                    ) : null}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <MusicControl />
    </header>
  )
}
