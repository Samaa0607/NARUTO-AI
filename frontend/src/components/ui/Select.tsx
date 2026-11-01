import { ChevronDown } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import styles from './Select.module.css'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  label: string
  value: string
  options: readonly SelectOption[]
  onChange: (value: string) => void
  icon?: ReactNode
  hint?: ReactNode
  disabled?: boolean
  id?: string
  className?: string
}

/** Native <select> (keyboard and screen-reader friendly) with the SHINOBI look. */
export function Select({ label, value, options, onChange, icon, hint, disabled = false, id, className }: SelectProps) {
  const autoId = useId()
  const selectId = id ?? `select-${autoId}`
  const hintId = hint ? `${selectId}-hint` : undefined
  return (
    <div className={[styles.field, disabled ? styles.disabled : '', className ?? ''].filter(Boolean).join(' ')}>
      <label htmlFor={selectId} className={styles.label}>
        {icon ? <span className={styles.icon}>{icon}</span> : null}
        {label}
      </label>
      <div className={styles.control}>
        <select
          id={selectId}
          className={styles.select}
          value={value}
          disabled={disabled}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.currentTarget.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className={styles.chevron} aria-hidden="true" />
      </div>
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
