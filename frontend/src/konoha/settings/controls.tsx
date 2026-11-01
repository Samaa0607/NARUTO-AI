// Light form controls of the Konoha look (Settings page): switch rows, sliders, a segmented choice
// and a select. Clean white rows on the parchment, Naruto-orange "on" states, light-blue focus.
import { useId, type CSSProperties, type ReactNode } from 'react'
import styles from './controls.module.css'

export function SettingRow({ icon, label, description, children, disabled }: {
  icon?: ReactNode
  label: ReactNode
  description?: ReactNode
  children?: ReactNode
  disabled?: boolean
}) {
  return (
    <div className={[styles.row, disabled ? styles.disabled : ''].filter(Boolean).join(' ')}>
      {icon ? (
        <span className={styles.rowIcon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
        {description ? <span className={styles.rowDesc}>{description}</span> : null}
      </div>
      {children ? <div className={styles.rowControl}>{children}</div> : null}
    </div>
  )
}

export function SwitchRow({ icon, label, description, checked, onChange, disabled }: {
  icon?: ReactNode
  label: string
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className={[styles.row, disabled ? styles.disabled : ''].filter(Boolean).join(' ')}>
      {icon ? (
        <span className={styles.rowIcon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className={styles.rowText}>
        <label className={styles.rowLabel} htmlFor={id}>
          {label}
        </label>
        {description ? (
          <span className={styles.rowDesc} id={`${id}-desc`}>
            {description}
          </span>
        ) : null}
      </div>
      <div className={styles.rowControl}>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-describedby={description ? `${id}-desc` : undefined}
          className={styles.switch}
          disabled={disabled}
          onClick={() => onChange(!checked)}
        >
          <span className={styles.knob} />
        </button>
      </div>
    </div>
  )
}

export function SliderRow({ label, value, onChange, disabled, hint }: {
  label: string
  /** 0..1 */
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  hint?: ReactNode
}) {
  const id = useId()
  const pct = Math.round(value * 100)
  return (
    <div className={[styles.slider, disabled ? styles.disabled : ''].filter(Boolean).join(' ')}>
      <div className={styles.sliderHead}>
        <label htmlFor={id} className={styles.rowLabel}>
          {label}
        </label>
        <span className={styles.sliderValue} aria-hidden="true">
          {pct}%
        </span>
      </div>
      <input
        id={id}
        className={styles.range}
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        disabled={disabled}
        aria-valuetext={`${pct}%`}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        style={{ '--fill': `${pct}%` } as CSSProperties}
      />
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

export function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string
  options: readonly SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
}) {
  const id = useId()
  return (
    <div className={styles.segmentedWrap}>
      <span className={styles.rowLabel} id={id}>
        {label}
      </span>
      <div className={styles.segmented} role="radiogroup" aria-labelledby={id}>
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              className={[styles.segment, active ? styles.segmentActive : ''].filter(Boolean).join(' ')}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => {
                const i = options.findIndex((o) => o.value === value)
                const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
                if (!step) return
                event.preventDefault()
                const next = options[(i + step + options.length) % options.length]
                onChange(next.value)
                const group = event.currentTarget.parentElement
                requestAnimationFrame(() => group?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus())
              }}
            >
              {option.icon ? <span className={styles.segmentIcon} aria-hidden="true">{option.icon}</span> : null}
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function SelectField({ label, value, options, onChange, hint, icon }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  hint?: ReactNode
  icon?: ReactNode
}) {
  const id = useId()
  return (
    <div className={styles.selectWrap}>
      <label htmlFor={id} className={styles.rowLabel}>
        {label}
      </label>
      <div className={styles.selectBox}>
        {icon ? <span className={styles.selectIcon} aria-hidden="true">{icon}</span> : null}
        <select id={id} className={styles.select} value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  )
}
