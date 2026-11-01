// The fixed village background behind the whole app: the painted plate with Naruto (left) and
// Sasuke (right), a soft orange light on Naruto's side, a soft blue one on Sasuke's side, and a few
// falling leaves (animations 'full' only). Purely decorative.
import plate from '../../assets/konoha/background.jpg'
import { useSettings } from '../../contexts/SettingsContext'
import { FallingLeaves } from './FallingLeaves'
import styles from './KonohaBackdrop.module.css'

export function KonohaBackdrop() {
  const { motion } = useSettings()
  return (
    <div className={styles.root} aria-hidden="true">
      <img className={styles.plate} src={plate} alt="" decoding="async" fetchPriority="high" />
      <div className={styles.wash} />
      <div className={`${styles.light} ${styles.naruto}`} />
      <div className={`${styles.light} ${styles.sasuke}`} />
      {motion === 'full' ? <FallingLeaves className={styles.leaves} /> : null}
    </div>
  )
}
