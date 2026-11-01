// The horizontal card carousel of the Jutsu and Practice pages. Cards sit side by side on one track
// that slides with a spring (framer-motion): the selected card leads on the left and the next card
// peeks in on the right. Left / right arrows, mouse drag, touch swipe, the dots and the keyboard
// (←/→, Home, End) all move the selection; the parent owns it (`active` / `onActiveChange`).
import { animate, motion, useMotionValue, type PanInfo } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import styles from './Carousel.module.css'

export interface CarouselItemState {
  index: number
  active: boolean
}

export interface CarouselProps<T> {
  items: readonly T[]
  getKey: (item: T) => string
  /** short name of an item (slide labels, dots, the status line) */
  getLabel: (item: T) => string
  active: number
  onActiveChange: (index: number) => void
  renderItem: (item: T, state: CarouselItemState) => ReactNode
  /** accessible name of the carousel, e.g. "Jutsu" */
  label: string
  /** noun for the arrow buttons: "Previous jutsu" / "Next jutsu" */
  noun?: string
  className?: string
  testId?: string
}

interface Geometry {
  /** track offset (px, >= 0) that brings each slide to the leading position, clamped at the end */
  offsets: number[]
}

const SPRING = { type: 'spring', stiffness: 280, damping: 34, mass: 0.9 } as const
const clampIndex = (i: number, n: number) => Math.max(0, Math.min(n - 1, i))

export function Carousel<T>({
  items,
  getKey,
  getLabel,
  active,
  onActiveChange,
  renderItem,
  label,
  noun = 'card',
  className,
  testId,
}: CarouselProps<T>) {
  const { motion: motionLevel } = useSettings()
  const smooth = motionLevel === 'full'
  const uid = useId()
  const trackId = `${uid}-track`
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const [geo, setGeo] = useState<Geometry>({ offsets: [] })
  const [dragging, setDragging] = useState(false)
  const dragged = useRef(false)
  const n = items.length
  const index = clampIndex(active, n)

  // slide positions, measured from the DOM (slide widths come from CSS container queries)
  const measure = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const slides = Array.from(track.children) as HTMLElement[]
    if (slides.length === 0) return
    const first = slides[0].offsetLeft
    const last = slides[slides.length - 1]
    const max = Math.max(0, last.offsetLeft + last.offsetWidth - first - track.clientWidth)
    const offsets = slides.map((s) => Math.round(Math.min(max, Math.max(0, s.offsetLeft - first))))
    setGeo((g) => (g.offsets.length === offsets.length && g.offsets.every((o, i) => o === offsets[i]) ? g : { offsets }))
  }, [])

  useLayoutEffect(() => {
    measure()
    const viewport = viewportRef.current
    if (!viewport || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(viewport)
    return () => ro.disconnect()
  }, [measure, n])

  const slideTo = useCallback(
    (offset: number, velocity = 0) => {
      if (!smooth) {
        x.set(-offset)
        return
      }
      animate(x, -offset, { ...SPRING, velocity })
    },
    [smooth, x],
  )

  // the selected card leads (clamped so the last card ends at the right edge)
  const target = geo.offsets[index] ?? 0
  useEffect(() => {
    slideTo(target)
  }, [target, slideTo])

  const go = useCallback(
    (i: number, focus = false) => {
      const next = clampIndex(i, n)
      if (next !== index) onActiveChange(next)
      else slideTo(geo.offsets[next] ?? 0)
      if (focus) {
        // focus the card's own control without letting the browser scroll the clipped viewport
        const slide = trackRef.current?.children[next] as HTMLElement | undefined
        const control = slide?.querySelector<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')
        control?.focus({ preventScroll: true })
      }
    },
    [geo.offsets, index, n, onActiveChange, slideTo],
  )

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    let next: number | null = null
    if (e.key === 'ArrowRight') next = index + 1
    else if (e.key === 'ArrowLeft') next = index - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    if (next === null) return
    e.preventDefault()
    go(next, true)
  }

  const onDragEnd = (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    setDragging(false)
    // the click that ends a drag must not select the card under the pointer
    window.setTimeout(() => {
      dragged.current = false
    }, 0)
    const offsets = geo.offsets
    if (offsets.length === 0) return
    const projected = -x.get() - info.velocity.x * 0.2
    let best = index
    for (let i = 0; i < offsets.length; i++) {
      if (Math.abs(offsets[i] - projected) < Math.abs(offsets[best] - projected) - 0.5) best = i
    }
    // a short flick still moves one card
    const flick = info.offset.x + info.velocity.x * 0.1
    if (best === index && (Math.abs(info.offset.x) > 36 || Math.abs(info.velocity.x) > 380)) {
      best = clampIndex(index + (flick < 0 ? 1 : -1), n)
    }
    if (best !== index) onActiveChange(best)
    // even when the selection stays (or its offset is unchanged), settle on a snap point
    slideTo(offsets[best] ?? 0, info.velocity.x)
  }

  // Tab onto a card that is off screen: keep the clipped viewport unscrolled and slide it in
  const onFocusCapture = () => {
    const viewport = viewportRef.current
    if (viewport && viewport.scrollLeft !== 0) viewport.scrollLeft = 0
  }

  const maxOffset = geo.offsets.length ? Math.max(...geo.offsets) : 0
  const atStart = index === 0
  const atEnd = index === n - 1

  return (
    <section
      className={[styles.carousel, className ?? ''].filter(Boolean).join(' ')}
      aria-roledescription="carousel"
      aria-label={label}
      data-testid={testId}
      data-active={index}
    >
      <div className={styles.frame}>
        <div
          ref={viewportRef}
          className={[styles.viewport, dragging ? styles.dragging : ''].filter(Boolean).join(' ')}
          onKeyDown={onKeyDown}
          onFocusCapture={onFocusCapture}
          onClickCapture={(e) => {
            if (dragged.current) {
              e.preventDefault()
              e.stopPropagation()
            }
          }}
        >
          <motion.div
            ref={trackRef}
            id={trackId}
            className={styles.track}
            style={{ x, touchAction: 'pan-y' }}
            drag={n > 1 ? 'x' : false}
            dragConstraints={{ left: -maxOffset, right: 0 }}
            dragElastic={0.14}
            dragMomentum={false}
            onDragStart={() => {
              dragged.current = true
              setDragging(true)
            }}
            onDragEnd={onDragEnd}
            data-testid={testId ? `${testId}-track` : undefined}
          >
            {items.map((item, i) => (
              <div
                key={getKey(item)}
                className={styles.slide}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${n}: ${getLabel(item)}`}
                data-active={i === index ? 'true' : 'false'}
              >
                {renderItem(item, { index: i, active: i === index })}
              </div>
            ))}
          </motion.div>
        </div>

        {n > 1 ? (
          <>
            <button
              type="button"
              className={[styles.arrow, styles.prev].join(' ')}
              onClick={() => go(index - 1)}
              disabled={atStart}
              aria-controls={trackId}
              aria-label={`Previous ${noun}`}
              data-testid={testId ? `${testId}-prev` : undefined}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              className={[styles.arrow, styles.next].join(' ')}
              onClick={() => go(index + 1)}
              disabled={atEnd}
              aria-controls={trackId}
              aria-label={`Next ${noun}`}
              data-testid={testId ? `${testId}-next` : undefined}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>

      {n > 1 ? (
        <div className={styles.pager}>
          <div className={styles.dots}>
            {items.map((item, i) => (
              <button
                key={getKey(item)}
                type="button"
                className={[styles.dot, i === index ? styles.dotActive : ''].filter(Boolean).join(' ')}
                onClick={() => go(i)}
                aria-label={`Show ${getLabel(item)}`}
                aria-current={i === index ? 'true' : undefined}
              />
            ))}
          </div>
          <span className={styles.count} aria-hidden="true">
            {index + 1} / {n}
          </span>
          <span className="visually-hidden" aria-live="polite" aria-atomic="true">
            {n > 0 ? `${getLabel(items[index])}, ${index + 1} of ${n}` : ''}
          </span>
        </div>
      ) : null}
    </section>
  )
}
