import { useId, type CSSProperties, type ReactNode } from 'react'
import styles from './Slider.module.css'

export interface SliderProps {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** text shown next to the label and read by screen readers (default: percent of the range) */
  format?: (value: number) => string
  icon?: ReactNode
  description?: ReactNode
  disabled?: boolean
  id?: string
  className?: string
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  format,
  icon,
  description,
  disabled = false,
  id,
  className,
}: SliderProps) {
  const autoId = useId()
  const inputId = id ?? `slider-${autoId}`
  const descId = description ? `${inputId}-desc` : undefined
  const fraction = max > min ? (value - min) / (max - min) : 0
  const text = format ? format(value) : `${Math.round(fraction * 100)}%`
  return (
    <div className={[styles.slider, disabled ? styles.disabled : '', className ?? ''].filter(Boolean).join(' ')}>
      <div className={styles.top}>
        <label htmlFor={inputId} className={styles.label}>
          {icon ? <span className={styles.icon}>{icon}</span> : null}
          {label}
        </label>
        <output htmlFor={inputId} className={styles.value}>
          {text}
        </output>
      </div>
      <input
        id={inputId}
        className={styles.input}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={text}
        aria-describedby={descId}
        style={{ '--fill': `${Math.min(1, Math.max(0, fraction)) * 100}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
      {description ? (
        <p id={descId} className={styles.description}>
          {description}
        </p>
      ) : null}
    </div>
  )
}
