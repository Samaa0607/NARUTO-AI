import { useId, type ReactNode } from 'react'
import styles from './Switch.module.css'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
  icon?: ReactNode
  disabled?: boolean
  id?: string
  className?: string
}

/** On/off toggle (role="switch"). The whole row is clickable. */
export function Switch({ checked, onChange, label, description, icon, disabled = false, id, className }: SwitchProps) {
  const autoId = useId()
  const buttonId = id ?? `switch-${autoId}`
  const labelId = `${buttonId}-label`
  const descId = description ? `${buttonId}-desc` : undefined
  return (
    <div className={[styles.row, disabled ? styles.disabled : '', className ?? ''].filter(Boolean).join(' ')}>
      <div className={styles.text}>
        <label id={labelId} htmlFor={buttonId} className={styles.label}>
          {icon ? <span className={styles.icon}>{icon}</span> : null}
          {label}
        </label>
        {description ? (
          <p id={descId} className={styles.description}>
            {description}
          </p>
        ) : null}
      </div>
      <button
        id={buttonId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descId}
        disabled={disabled}
        className={[styles.switch, checked ? styles.on : ''].filter(Boolean).join(' ')}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.thumb} aria-hidden="true" />
      </button>
    </div>
  )
}
