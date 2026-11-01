// Layout route for the pages that still use the old dark design (Practice, Jutsu Library, Settings,
// About, 404): a dark translucent panel keeps them readable on the light village background until
// they are redesigned.
import { Outlet } from 'react-router-dom'
import styles from './LegacyFrame.module.css'

export function LegacyFrame() {
  return (
    <div className={styles.frame}>
      <Outlet />
    </div>
  )
}
