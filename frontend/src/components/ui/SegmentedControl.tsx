import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import styles from './SegmentedControl.module.css'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  /** accessible name of the group */
  label: string
  /** id of a visible label element (instead of `label`) */
  labelledBy?: string
  size?: 'sm' | 'md'
  className?: string
}

/** A single choice between a few options (radio group with arrow-key navigation). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  labelledBy,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
    let next: number | null = null
    if (event.key in keys) next = (index + keys[event.key] + options.length) % options.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = options.length - 1
    if (next === null) return
    event.preventDefault()
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className={[styles.group, size === 'sm' ? styles.sm : '', className ?? ''].filter(Boolean).join(' ')}
      style={{ '--count': options.length, '--index': index } as CSSProperties}
      onKeyDown={onKeyDown}
    >
      <span className={styles.indicator} aria-hidden="true" />
      {options.map((option, i) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={[styles.option, selected ? styles.selected : ''].filter(Boolean).join(' ')}
            onClick={() => onChange(option.value)}
          >
            {option.icon ? <span className={styles.icon}>{option.icon}</span> : null}
            <span className={styles.text}>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
