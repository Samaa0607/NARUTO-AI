import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import styles from './Lightbox.module.css'

export interface LightboxImage {
  src: string
  alt: string
  /** shown in the header */
  title?: ReactNode
  /** shown under the image (e.g. the licence line) */
  caption?: ReactNode
}

export interface LightboxProps {
  /** the image to show; null = closed */
  image: LightboxImage | null
  onClose: () => void
  /** optional previous / next navigation (also bound to the arrow keys) */
  onPrev?: () => void
  onNext?: () => void
  /** e.g. "2 / 4" */
  position?: string
}

/** Full-screen image viewer on a native modal <dialog> (focus trap, Esc, inert background). */
export function Lightbox({ image, onClose, onPrev, onNext, position }: LightboxProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const open = image !== null

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={typeof image?.title === 'string' ? image.title : image?.alt}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' && onPrev) onPrev()
        if (e.key === 'ArrowRight' && onNext) onNext()
      }}
    >
      {image ? (
        <div className={styles.frame}>
          <header className={styles.header}>
            <div className={styles.heading}>
              {image.title ? <p className={styles.title}>{image.title}</p> : null}
              {position ? <span className={styles.position}>{position}</span> : null}
            </div>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Close" autoFocus>
              <X aria-hidden="true" />
            </button>
          </header>
          <div className={styles.stage}>
            {onPrev ? (
              <button type="button" className={`${styles.nav} ${styles.prev}`} onClick={onPrev} aria-label="Previous image">
                <ChevronLeft aria-hidden="true" />
              </button>
            ) : null}
            {failed === image.src ? (
              <div className={styles.failed}>
                <ImageOff aria-hidden="true" />
                <p>This image could not be loaded. Is the SHINOBI AI server running?</p>
              </div>
            ) : (
              <img
                key={image.src}
                className={styles.image}
                src={image.src}
                alt={image.alt}
                onError={() => setFailed(image.src)}
              />
            )}
            {onNext ? (
              <button type="button" className={`${styles.nav} ${styles.next}`} onClick={onNext} aria-label="Next image">
                <ChevronRight aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {image.caption ? <div className={styles.caption}>{image.caption}</div> : null}
        </div>
      ) : null}
    </dialog>
  )
}
