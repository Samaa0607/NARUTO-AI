// The fixed, theme-aware backdrop of the whole app: cinematic gradients, slow drifting chakra fog,
// the particle field, a vignette and film grain. Purely decorative.
import { useSettings } from '../../contexts/SettingsContext'
import { useTheme } from '../../contexts/ThemeContext'
import { ParticleField } from './ParticleField'
import styles from './ChakraBackground.module.css'

export interface ChakraBackgroundProps {
  /** lighter particle field (fewer, slower, no lightning): used behind the live camera pages */
  calm?: boolean
}

export function ChakraBackground({ calm = false }: ChakraBackgroundProps) {
  const { theme } = useTheme()
  const { motion } = useSettings()
  const particles = calm && motion === 'full' ? 'reduced' : motion
  return (
    <div className={styles.root} aria-hidden="true">
      <div className={styles.tint} />
      <div className={styles.fog}>
        <span className={`${styles.cloud} ${styles.c1}`} />
        <span className={`${styles.cloud} ${styles.c2}`} />
        <span className={`${styles.cloud} ${styles.c3}`} />
      </div>
      <ParticleField className={styles.particles} theme={theme} motion={particles} />
      <div className={styles.vignette} />
      <div className={styles.grain} />
    </div>
  )
}
