// About: what SHINOBI AI is, how the recognition works, the technologies, the credits
// (GET /api/credits) and the disclaimer.
import { Brain, ExternalLink, Hand, ScanEye, ScrollText, Sparkles, Webcam, Workflow } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useDocumentTitle } from '../components/layout/useDocumentTitle'
import {
  Button,
  ErrorState,
  Reveal,
  SectionHeading,
  Skeleton,
  START_SERVER_HINT,
  describeServerError,
} from '../components/ui'
import { api } from '../services/api'
import type { CreditItem, CreditSection, Credits } from '../types/catalog'
import styles from './AboutPage.module.css'

const PIPELINE = [
  {
    icon: Webcam,
    title: 'Camera',
    tech: 'Browser · WebSocket',
    text: 'The browser sends your camera frames to the Python server over a WebSocket. Every browser tab gets its own independent session.',
  },
  {
    icon: Hand,
    title: 'Hand landmarks',
    tech: 'MediaPipe',
    text: 'MediaPipe finds up to two hands in every frame and tracks 21 landmarks on each of them.',
  },
  {
    icon: ScanEye,
    title: 'Seal detector',
    tech: 'YOLOX · ONNX Runtime',
    text: 'A YOLOX-Nano model recognises the seven official seals used here: Ram, Snake, Tiger, Dog, Monkey, Boar and Horse.',
  },
  {
    icon: Brain,
    title: 'Landmark classifier',
    tech: 'scikit-learn',
    text: 'A classifier trained on hand landmarks recognises the custom poses that have no detector class: the Clone seal and the Rasengan palm.',
  },
  {
    icon: Workflow,
    title: 'Fusion & sequence',
    tech: 'Python',
    text: 'Both results are fused into one sign per frame. A sign counts once it is held steadily (hold time), the next one must follow within a few seconds (timeout), and after a jutsu a short cooldown applies.',
  },
  {
    icon: Sparkles,
    title: 'Effects',
    tech: 'OpenCV',
    text: 'The backend draws the jutsu with OpenCV on the frame it sends back. Shadow Clone uses person segmentation to cut you out of the picture and place ten clones around you.',
  },
]

const TECH = [
  { group: 'AI backend', items: ['Python', 'MediaPipe', 'ONNX Runtime', 'YOLOX', 'scikit-learn', 'OpenCV', 'FastAPI', 'WebSocket'] },
  { group: 'Web app', items: ['React', 'TypeScript', 'Vite', 'Framer Motion'] },
]

type CreditsState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; credits: Credits }

function useCredits(): [CreditsState, () => void] {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<CreditsState>({ status: 'loading' })
  useEffect(() => {
    const abort = new AbortController()
    api
      .credits(abort.signal)
      .then((credits) => setState({ status: 'ok', credits }))
      .catch((e: unknown) => {
        if (abort.signal.aborted) return
        setState({ status: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => abort.abort()
  }, [attempt])
  const retry = () => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }
  return [state, retry]
}

function Credit({ item }: { item: CreditItem }) {
  return (
    <li className={styles.credit}>
      <p className={styles.creditText}>{item.text}</p>
      {item.url || item.license ? (
        <p className={styles.creditLinks}>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer noopener">
              Source <ExternalLink aria-hidden="true" />
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          ) : null}
          {item.license ? (
            item.license_url ? (
              <a href={item.license_url} target="_blank" rel="noreferrer noopener" className={styles.license}>
                {item.license}
                <span className="visually-hidden"> licence (opens in a new tab)</span>
              </a>
            ) : (
              <span className={styles.license}>{item.license}</span>
            )
          ) : null}
        </p>
      ) : null}
    </li>
  )
}

const isDisclaimer = (section: CreditSection) => /disclaimer/i.test(section.title)

export function AboutPage() {
  useDocumentTitle('About')
  const [credits, retryCredits] = useCredits()
  const sections = credits.status === 'ok' ? credits.credits.sections : []
  const creditSections = sections.filter((s) => !isDisclaimer(s))
  const serverDisclaimer = sections.filter(isDisclaimer).flatMap((s) => s.items)

  return (
    <div className={styles.page}>
      <Reveal immediate>
        <header className={styles.intro}>
          <SectionHeading
            as="h1"
            eyebrow="About"
            title="About SHINOBI AI"
            kanji="志"
            description="SHINOBI AI turns your webcam into a training ground for ninja hand signs. You perform the four signs of a jutsu, an AI backend recognises each one in real time, and when the whole sequence is right the jutsu appears on your live video."
          />
        </header>
      </Reveal>

      <Reveal>
        <section className={styles.objective} aria-labelledby="objective-title">
          <h2 id="objective-title" className={styles.smallTitle}>
            The objective
          </h2>
          <p className={styles.quote}>
            A fun, honest demo of real-time computer vision: every sign and every jutsu you see is decided by the
            models on the server, never faked by the interface.
          </p>
          <p className={styles.objectiveText}>
            It is also built to be learnable. Each sequence comes with reference cards, cues for every sign and a
            practice mode that tells you exactly which step went wrong.
          </p>
        </section>
      </Reveal>

      <section className={styles.section} aria-labelledby="how-title">
        <Reveal>
          <SectionHeading
            id="how-title"
            eyebrow="How it works"
            title="From a frame to a jutsu"
            description="Every frame takes the same path through the Python pipeline. The web app only shows what the server reports."
          />
        </Reveal>
        <ol className={styles.pipeline}>
          {PIPELINE.map((stage, i) => {
            const Icon = stage.icon
            return (
              <li key={stage.title} className={styles.stage}>
                <Reveal delay={(i % 3) * 0.08} className={styles.stageInner}>
                  <div className={styles.stageTop}>
                    <span className={styles.stageIcon} aria-hidden="true">
                      <Icon />
                    </span>
                    <span className={styles.stageNum} aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className={styles.stageTitle}>{stage.title}</h3>
                  <p className={styles.stageTech}>{stage.tech}</p>
                  <p className={styles.stageText}>{stage.text}</p>
                </Reveal>
              </li>
            )
          })}
        </ol>
      </section>

      <section className={styles.section} aria-labelledby="tech-title">
        <Reveal>
          <SectionHeading id="tech-title" eyebrow="Built with" title="Technologies" />
        </Reveal>
        <Reveal className={styles.techGroups}>
          {TECH.map((group) => (
            <div key={group.group} className={styles.techGroup}>
              <h3 className={styles.smallTitle}>{group.group}</h3>
              <ul className={styles.chips}>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </Reveal>
      </section>

      <section className={styles.section} aria-labelledby="credits-title" id="credits">
        <Reveal>
          <SectionHeading
            id="credits-title"
            eyebrow="Credits"
            title="Credits & licences"
            description="Read from the SHINOBI AI server, so this list always matches the assets it serves."
          />
        </Reveal>
        {credits.status === 'loading' ? (
          <div className={styles.creditGrid} aria-busy="true" aria-label="Loading the credits">
            {[0, 1, 2].map((i) => (
              <div key={i} className={styles.creditSection}>
                <Skeleton width="55%" height={22} />
                <Skeleton width="100%" height={14} />
                <Skeleton width="90%" height={14} />
                <Skeleton width="70%" height={14} />
              </div>
            ))}
          </div>
        ) : credits.status === 'error' ? (
          <div className={styles.offline}>
            <ErrorState
              compact
              title="Credits unavailable: the server is offline"
              message={describeServerError(credits.message)}
              onRetry={retryCredits}
            >
              <p>{START_SERVER_HINT}</p>
            </ErrorState>
          </div>
        ) : (
          <div className={styles.creditGrid}>
            {creditSections.map((section) => (
              <Reveal key={section.title} className={styles.creditSection}>
                <h3 className={styles.creditTitle}>{section.title}</h3>
                <ul className={styles.creditList}>
                  {section.items.map((item) => (
                    <Credit key={item.text} item={item} />
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        )}
      </section>

      <Reveal>
        <section className={styles.disclaimer} aria-labelledby="disclaimer-title">
          <ScrollText className={styles.disclaimerIcon} aria-hidden="true" />
          <div className={styles.disclaimerBody}>
            <h2 id="disclaimer-title" className={styles.smallTitle}>
              Disclaimer
            </h2>
            <p>
              SHINOBI AI is an unofficial fan project for personal and educational use. It is not affiliated with or
              endorsed by the rights holders. Naruto, its characters, names and hand seals belong to their respective
              rights holders.
            </p>
            {serverDisclaimer.map((item) => (
              <p key={item.text}>{item.text}</p>
            ))}
            <p className={styles.made}>Developed as the SHINOBI AI project.</p>
            <div>
              <Button variant="secondary" size="sm" to="/library">
                Explore the Jutsu Library
              </Button>
            </div>
          </div>
        </section>
      </Reveal>
    </div>
  )
}
