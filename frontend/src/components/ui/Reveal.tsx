import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { useSettings } from '../../contexts/SettingsContext'

export interface RevealProps {
  children: ReactNode
  /** seconds */
  delay?: number
  /** pixels the content rises while fading in (full motion only) */
  y?: number
  className?: string
  /** reveal immediately on mount instead of when scrolled into view */
  immediate?: boolean
}

/** Fades content in when it scrolls into view. Honours the animation preference. */
export function Reveal({ children, delay = 0, y = 22, className, immediate = false }: RevealProps) {
  const { motion: level } = useSettings()
  if (level === 'off') return <div className={className}>{children}</div>
  const full = level === 'full'
  const target = { opacity: 1, y: 0 }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: full ? y : 0 }}
      animate={immediate ? target : undefined}
      whileInView={immediate ? undefined : target}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: full ? 0.75 : 0.25, delay: full ? delay : 0, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}
