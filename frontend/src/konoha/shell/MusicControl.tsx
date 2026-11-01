// Small background-music control in the header: a play / pause toggle and a volume popover.
// On phones only the toggle is shown (the volume is in Settings).
import { Music, Volume1, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { MUSIC_CONTROL_ATTR, useMusic } from '../music/MusicContext'
import styles from './MusicControl.module.css'

export function MusicControl() {
  const music = useMusic()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()
  const active = music.on && music.available

  // close the popover on a click outside or Escape
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const VolumeIcon = music.volume === 0 ? VolumeX : music.volume < 0.5 ? Volume1 : Volume2
  const title = !music.available
    ? 'Sounds are turned off in Settings'
    : music.on
      ? music.waiting
        ? 'Music starts with your first click'
        : 'Pause the music'
      : 'Play soft background music'

  return (
    <div ref={rootRef} className={styles.root} {...{ [MUSIC_CONTROL_ATTR]: '' }}>
      <button
        type="button"
        className={[styles.toggle, active ? styles.on : ''].filter(Boolean).join(' ')}
        aria-pressed={music.on}
        aria-label="Background music"
        title={title}
        disabled={!music.available}
        onClick={music.toggle}
      >
        {active ? (
          <span className={[styles.bars, music.playing ? styles.barsPlaying : ''].filter(Boolean).join(' ')} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        ) : (
          <Music aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className={styles.volumeButton}
        aria-label="Music volume"
        aria-expanded={open}
        aria-controls={popoverId}
        title="Music volume"
        disabled={!music.available}
        onClick={() => setOpen((v) => !v)}
      >
        <VolumeIcon aria-hidden="true" />
      </button>
      <div id={popoverId} className={styles.popover} hidden={!open}>
        <label className={styles.popLabel} htmlFor={`${popoverId}-range`}>
          Music volume <span className={styles.popValue}>{Math.round(music.volume * 100)}%</span>
        </label>
        <input
          id={`${popoverId}-range`}
          className={styles.range}
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(music.volume * 100)}
          onChange={(event) => music.setVolume(Number(event.target.value) / 100)}
          style={{ '--fill': `${Math.round(music.volume * 100)}%` } as CSSProperties}
        />
        <p className={styles.popHint}>{music.on ? 'Soft loop, original music.' : 'Music is paused.'}</p>
      </div>
    </div>
  )
}
