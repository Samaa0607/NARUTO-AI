// The hand signs of a jutsu, in the light look: numbered white tiles with the sign's line art
// (catalog.signs[sign].art), its name, Japanese name and how-to cues. A soft glow walks over the
// tiles in order (1 → 4) to show the sequence; it stops with the "reduced"/"off" animation setting.
import { ArrowRight, Hand } from 'lucide-react'
import { useState } from 'react'
import { signName } from '../../components/live/labels'
import type { Catalog, JutsuInfo, SignInfo } from '../../types/catalog'
import styles from './SignSteps.module.css'

/** The line art (black lines on white); a hand icon if the drawing fails to load. */
export function SignArt({ sign, className, alt }: { sign: SignInfo | undefined; className?: string; alt?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (!sign || failed === sign.art) {
    return (
      <span
        className={[styles.missing, className ?? ''].filter(Boolean).join(' ')}
        role="img"
        aria-label={sign ? `${sign.name} hand sign (drawing unavailable)` : 'Hand sign'}
      >
        <Hand aria-hidden="true" />
      </span>
    )
  }
  return (
    <img
      className={[styles.art, className ?? ''].filter(Boolean).join(' ')}
      src={sign.art}
      alt={alt ?? `${sign.name} hand sign, line drawing`}
      decoding="async"
      draggable={false}
      onError={() => setFailed(sign.art)}
    />
  )
}

export interface SignStepsProps {
  jutsu: JutsuInfo
  catalog: Catalog
  /** how many cues to list under each sign (default: all) */
  cues?: number
}

export function SignSteps({ jutsu, catalog, cues }: SignStepsProps) {
  const total = jutsu.steps.length
  return (
    <ol className={styles.steps} aria-label={`${jutsu.title}: ${total} hand signs, in this order`} data-testid="sign-steps">
      {jutsu.steps.map((step, i) => {
        const sign = catalog.signs[step.sign]
        const list = sign ? (cues === undefined ? sign.cues : sign.cues.slice(0, cues)) : []
        return (
          <li key={step.step} className={styles.step} data-sign={step.sign}>
            <div className={styles.tile} style={{ animationDelay: `${i * 1.5}s` }}>
              <span className={styles.num} aria-hidden="true">
                {step.step}
              </span>
              <SignArt sign={sign} />
              {i < total - 1 ? <ArrowRight className={styles.arrow} aria-hidden="true" /> : null}
            </div>
            <p className={styles.name}>
              <span className="visually-hidden">Step {step.step}: </span>
              {signName(catalog, step.sign)}
            </p>
            {sign?.jp ? (
              <p className={styles.jp} lang="ja">
                {sign.jp}
              </p>
            ) : null}
            {sign && !sign.recognizable ? <p className={styles.untrained}>Not recognisable on this server yet</p> : null}
            {list.length > 0 ? (
              <ul className={styles.cues}>
                {list.map((cue) => (
                  <li key={cue}>{cue}</li>
                ))}
              </ul>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

/** Licence of the drawings: Schlum's seals (CC BY-SA 4.0); the custom palm is SHINOBI AI's own. */
export function ArtCredit({ signs, className }: { signs: (SignInfo | undefined)[]; className?: string }) {
  const list = signs.filter((s): s is SignInfo => Boolean(s))
  const commons = list.length === 0 || list.some((s) => s.official)
  const own = list.some((s) => !s.official)
  return (
    <p className={[styles.credit, className ?? ''].filter(Boolean).join(' ')} data-testid="art-credit">
      {commons ? (
        <span>
          Hand-sign line art:{' '}
          <a href="https://commons.wikimedia.org/wiki/User:Schlum" target="_blank" rel="noreferrer noopener">
            Schlum
          </a>{' '}
          / Wikimedia Commons,{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer noopener">
            CC BY-SA 4.0
          </a>
          , lines thickened
        </span>
      ) : null}
      {own ? <span>Palm pose drawn for this project</span> : null}
    </p>
  )
}
