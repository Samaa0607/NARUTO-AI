// A short wave of chakra light across the screen whenever the theme changes (also once on load).
// Re-keyed by theme so the CSS animation replays; invisible when animations are off.
import { useTheme } from '../../contexts/ThemeContext'
import styles from './ThemeShift.module.css'

export function ThemeShift() {
  const { theme } = useTheme()
  return (
    <div key={theme} className={styles.shift} aria-hidden="true">
      <span className={styles.wave} />
    </div>
  )
}
