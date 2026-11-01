import { Flame, Zap } from 'lucide-react'
import { useTheme, type ThemeId } from '../../contexts/ThemeContext'
import styles from './ThemeToggle.module.css'

const OPTIONS: { id: ThemeId; label: string; icon: typeof Flame }[] = [
  { id: 'naruto', label: 'Naruto Mode', icon: Flame },
  { id: 'sasuke', label: 'Sasuke Mode', icon: Zap },
]

export interface ThemeToggleProps {
  /** compact = icons only (top bar); full = icons and labels (mobile menu) */
  variant?: 'compact' | 'full'
  className?: string
}

/** Naruto / Sasuke switch. Changes only the look of the app, never the recognition. */
export function ThemeToggle({ variant = 'compact', className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()
  return (
    <div
      className={[styles.toggle, styles[variant], className ?? ''].filter(Boolean).join(' ')}
      role="group"
      aria-label="Visual theme"
      data-active={theme}
    >
      <span className={styles.thumb} aria-hidden="true" />
      {OPTIONS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={[styles.option, styles[id]].join(' ')}
          aria-pressed={theme === id}
          aria-label={variant === 'compact' ? label : undefined}
          title={label}
          onClick={() => setTheme(id)}
        >
          <Icon aria-hidden="true" />
          {variant === 'full' ? <span>{label}</span> : null}
        </button>
      ))}
    </div>
  )
}
