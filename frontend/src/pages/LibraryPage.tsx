// Jutsu Library: the four jutsu from /api/jutsu (API order), and /library/:jutsuId with every step,
// the sign cues, the reference cards (lightbox) and the full sequence card.
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Expand,
  Hand,
  Info,
  Radar,
  ScanEye,
  ScrollText,
  Stamp,
  Swords,
  Target,
  TriangleAlert,
} from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import { JutsuMotif } from '../components/art/JutsuMotif'
import { jutsuVisual } from '../components/art/jutsuVisuals'
import { useDocumentTitle } from '../components/layout/useDocumentTitle'
import {
  ArtCredit,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Lightbox,
  Reveal,
  SectionHeading,
  SequenceBadge,
  SignArt,
  Skeleton,
  START_SERVER_HINT,
  describeServerError,
  type LightboxImage,
} from '../components/ui'
import { useCatalog } from '../contexts/CatalogContext'
import type { Catalog, JutsuInfo, SignInfo } from '../types/catalog'
import type { SignId } from '../types/protocol'
import styles from './LibraryPage.module.css'

const signOf = (catalog: Catalog, id: SignId): SignInfo | undefined => catalog.signs[id]
const signLabel = (catalog: Catalog, id: SignId) => signOf(catalog, id)?.name ?? id.replace(/_/g, ' ').toUpperCase()

const jutsuStyle = (jutsu: JutsuInfo) => {
  const v = jutsuVisual(jutsu.id)
  return { '--j': v.color, '--j2': v.color2 } as CSSProperties
}

/** "Needs the landmark model — not recognisable yet" with the missing signs. */
function Availability({ jutsu, catalog }: { jutsu: JutsuInfo; catalog: Catalog }) {
  if (jutsu.available) {
    return (
      <Badge tone="success" icon={<CircleCheck />} className={styles.ready}>
        Recognisable on this server
      </Badge>
    )
  }
  const missing = jutsu.missing_signs.map((id) => signOf(catalog, id))
  const needsLandmarks = missing.some((s) => s?.recognizer === 'landmarks')
  const needsYolox = missing.some((s) => s?.recognizer === 'yolox')
  const needs = [needsLandmarks ? 'the landmark model' : null, needsYolox ? 'the seal detector (YOLOX)' : null]
    .filter(Boolean)
    .join(' and ')
  return (
    <div className={styles.unavailable} role="note">
      <TriangleAlert aria-hidden="true" />
      <div>
        <p className={styles.unavailableTitle}>
          {needs ? `Needs ${needs}` : 'Not available on this server'} — not recognisable yet
        </p>
        <p className={styles.unavailableText}>
          Missing {jutsu.missing_signs.length === 1 ? 'sign' : 'signs'}:{' '}
          {jutsu.missing_signs.map((id, i) => (
            <span key={id}>
              {i > 0 ? ', ' : null}
              <strong>{signLabel(catalog, id)}</strong>
            </span>
          ))}
          . You can still learn the sequence here.
        </p>
      </div>
    </div>
  )
}

function SequenceStrip({ jutsu, catalog }: { jutsu: JutsuInfo; catalog: Catalog }) {
  return (
    <ol className={styles.strip} aria-label={`${jutsu.title} sequence`}>
      {jutsu.steps.map((step) => {
        const sign = signOf(catalog, step.sign)
        return (
          <li key={step.step} className={styles.stripStep}>
            <SignArt
              src={sign?.art ?? ''}
              alt={`${sign?.name ?? step.sign} hand sign`}
              tint="color-mix(in srgb, var(--j) 30%, white)"
              className={styles.stripArt}
            />
            <span className={styles.stripNum}>Step {step.step}</span>
            <span className={styles.stripName}>{signLabel(catalog, step.sign)}</span>
            {sign?.jp ? (
              <span className={styles.stripJp} lang="ja">
                {sign.jp}
              </span>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------------------------- list
function JutsuEntry({ jutsu, catalog, index }: { jutsu: JutsuInfo; catalog: Catalog; index: number }) {
  const visual = jutsuVisual(jutsu.id)
  const titleId = `jutsu-${jutsu.id}`
  return (
    <article className={styles.entry} style={jutsuStyle(jutsu)} aria-labelledby={titleId}>
      <div className={styles.entryAside}>
        <span className={styles.entryIndex} aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <JutsuMotif kind={visual.motif} color={visual.color} color2={visual.color2} size="100%" className={styles.entryMotif} />
        <span className={styles.entryKanji} lang="ja">
          {jutsu.kanji}
        </span>
      </div>
      <div className={styles.entryMain}>
        <header className={styles.entryHead}>
          <SequenceBadge official={jutsu.official} size="md" />
          <h2 id={titleId} className={styles.entryTitle}>
            <Link to={`/library/${jutsu.id}`}>{jutsu.title}</Link>
          </h2>
          <p className={styles.entryName}>{jutsu.name}</p>
        </header>
        <p className={styles.entryDescription}>{jutsu.description}</p>
        <p className={styles.provenance}>
          {jutsu.official ? <Stamp aria-hidden="true" /> : <Info aria-hidden="true" />}
          <span>{jutsu.provenance}</span>
        </p>
        <Availability jutsu={jutsu} catalog={catalog} />
        <SequenceStrip jutsu={jutsu} catalog={catalog} />
        <div className={styles.entryFoot}>
          <div className={styles.actions}>
            <Button to={`/practice/${jutsu.id}`} icon={<Target />}>
              Practice
            </Button>
            <Button variant="secondary" to={`/library/${jutsu.id}`} iconEnd={<ArrowRight />}>
              Open the scroll
            </Button>
          </div>
          <ArtCredit signs={jutsu.steps.map((s) => signOf(catalog, s.sign))} />
        </div>
      </div>
    </article>
  )
}

function LibraryHeader() {
  return (
    <header className={styles.header}>
      <SectionHeading
        as="h1"
        eyebrow="Jutsu Library"
        title="The four scrolls"
        kanji="巻"
        description="Every jutsu is a sequence of four hand signs, made in order. Learn them here, then practise them one at a time."
      />
      <dl className={styles.legend}>
        <div>
          <dt>
            <SequenceBadge official />
          </dt>
          <dd>Four consecutive seals from the original source, in their original order.</dd>
        </div>
        <div>
          <dt>
            <SequenceBadge official={false} />
          </dt>
          <dd>Designed for SHINOBI AI, because the source has fewer than four seals for this jutsu.</dd>
        </div>
      </dl>
    </header>
  )
}

function ListSkeleton() {
  return (
    <div className={styles.list} aria-busy="true" aria-label="Loading the jutsu">
      {[0, 1].map((i) => (
        <div key={i} className={`${styles.entry} ${styles.skeletonEntry}`}>
          <div className={styles.entryAside}>
            <Skeleton width="70%" height={140} radius={70} />
          </div>
          <div className={styles.entryMain}>
            <Skeleton width={190} height={28} radius={999} />
            <Skeleton width="45%" height={56} />
            <Skeleton width="80%" height={18} />
            <div className={styles.strip}>
              {[0, 1, 2, 3].map((k) => (
                <Skeleton key={k} height="auto" style={{ aspectRatio: '1' }} radius={14} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function Offline() {
  const { error, reload } = useCatalog()
  return (
    <div className={styles.offline}>
      <ErrorState message={describeServerError(error)} onRetry={reload}>
        <p>{START_SERVER_HINT}</p>
      </ErrorState>
    </div>
  )
}

function JutsuList() {
  useDocumentTitle('Jutsu Library')
  const { catalog, loading, error } = useCatalog()
  return (
    <div className={styles.page}>
      <Reveal immediate>
        <LibraryHeader />
      </Reveal>
      {loading ? (
        <ListSkeleton />
      ) : error || !catalog ? (
        <Offline />
      ) : (
        <div className={styles.list}>
          {catalog.jutsu.map((jutsu, i) => (
            <Reveal key={jutsu.id}>
              <JutsuEntry jutsu={jutsu} catalog={catalog} index={i} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------- detail
function SignFacts({ sign }: { sign: SignInfo | undefined }) {
  if (!sign) return null
  return (
    <ul className={styles.facts} aria-label="About this sign">
      <li>
        <Hand aria-hidden="true" />
        {sign.hands === 2 ? 'Both hands' : 'One hand'}
      </li>
      <li>
        <Stamp aria-hidden="true" />
        {sign.official ? 'Official seal' : 'Custom pose'}
      </li>
      <li>
        <ScanEye aria-hidden="true" />
        {sign.recognizer === 'yolox' ? 'Seal detector (YOLOX)' : 'Landmark classifier'}
      </li>
      <li className={sign.recognizable ? styles.factOk : styles.factWarn}>
        <Radar aria-hidden="true" />
        {sign.recognizable ? 'Recognisable now' : 'Not recognisable on this server'}
      </li>
    </ul>
  )
}

function JutsuDetail({ id }: { id: string }) {
  const { catalog, loading, error, jutsu: findJutsu } = useCatalog()
  const jutsu = findJutsu(id)
  useDocumentTitle(jutsu ? `${jutsu.title} · Jutsu Library` : 'Jutsu Library')
  const [viewer, setViewer] = useState<number | null>(null)

  if (loading) {
    return (
      <div className={styles.page} aria-busy="true">
        <Skeleton width={160} height={20} />
        <div className={styles.detailHero}>
          <Skeleton width="100%" height={260} radius={130} />
          <div className={styles.detailIntro}>
            <Skeleton width="50%" height={80} />
            <Skeleton width="70%" height={20} />
            <Skeleton width="90%" height={20} />
          </div>
        </div>
      </div>
    )
  }
  if (error || !catalog) {
    return (
      <div className={styles.page}>
        <BackLink />
        <Offline />
      </div>
    )
  }
  if (!jutsu) {
    return (
      <div className={styles.page}>
        <BackLink />
        <div className={styles.offline}>
          <EmptyState
            icon={<ScrollText />}
            title="No scroll by that name"
            actions={
              <Button variant="secondary" to="/library" icon={<ArrowLeft />}>
                Back to the library
              </Button>
            }
          >
            <p>
              There is no jutsu called “{id}”. The library holds{' '}
              {catalog.jutsu.map((j, i) => (
                <span key={j.id}>
                  {i > 0 ? (i === catalog.jutsu.length - 1 ? ' and ' : ', ') : null}
                  <Link to={`/library/${j.id}`}>{j.title.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())}</Link>
                </span>
              ))}
              .
            </p>
          </EmptyState>
        </div>
      </div>
    )
  }

  const visual = jutsuVisual(jutsu.id)
  const signs = jutsu.steps.map((s) => signOf(catalog, s.sign))
  const position = catalog.jutsu.findIndex((j) => j.id === jutsu.id)
  const prev = catalog.jutsu[(position - 1 + catalog.jutsu.length) % catalog.jutsu.length]
  const next = catalog.jutsu[(position + 1) % catalog.jutsu.length]

  const images: LightboxImage[] = [
    ...jutsu.steps.map((step) => ({
      src: step.card,
      alt: `${jutsu.title}, step ${step.step} of ${jutsu.steps.length}: ${signLabel(catalog, step.sign)} reference card`,
      title: `Step ${step.step} · ${signLabel(catalog, step.sign)}`,
      caption: <ArtCredit signs={[signOf(catalog, step.sign)]} />,
    })),
    {
      src: jutsu.sequence_image,
      alt: `${jutsu.title}: the full four-step sequence card`,
      title: `${jutsu.title} · full sequence`,
      caption: <ArtCredit signs={signs} />,
    },
  ]
  const stepCount = jutsu.steps.length
  const viewing = viewer === null ? null : images[viewer]
  const onStepCard = viewer !== null && viewer < stepCount

  return (
    <div className={styles.page} style={jutsuStyle(jutsu)}>
      <BackLink />

      <section className={styles.detailHero} aria-labelledby="jutsu-title">
        <Reveal immediate className={styles.detailArt}>
          <span className={styles.detailGlyph} aria-hidden="true">
            {visual.glyph}
          </span>
          <JutsuMotif kind={visual.motif} color={visual.color} color2={visual.color2} size="100%" />
        </Reveal>
        <Reveal immediate delay={0.08} className={styles.detailIntro}>
          <p className={styles.detailKanji} lang="ja">
            {jutsu.kanji}
          </p>
          <h1 id="jutsu-title" className={styles.detailTitle}>
            {jutsu.title}
          </h1>
          <p className={styles.detailName}>{jutsu.name}</p>
          <div className={styles.detailBadges}>
            <SequenceBadge official={jutsu.official} size="md" />
          </div>
          <p className={styles.detailDescription}>{jutsu.description}</p>
          <div className={styles.provenanceBlock}>
            <p className={styles.tag}>{jutsu.tag}</p>
            <p>{jutsu.provenance}</p>
          </div>
          <Availability jutsu={jutsu} catalog={catalog} />
          <div className={styles.actions}>
            <Button size="lg" to={`/practice/${jutsu.id}`} icon={<Target />}>
              Practice this jutsu
            </Button>
            <Button size="lg" variant="secondary" to="/live" icon={<Swords />}>
              Live Demo
            </Button>
          </div>
        </Reveal>
      </section>

      <section className={styles.detailSection} aria-labelledby="steps-title">
        <SectionHeading
          id="steps-title"
          eyebrow="The sequence"
          title="Four signs, in this order"
          description="Hold each sign still for about a second, then move on to the next one. The same signs in another order do nothing."
        />
        <ol className={styles.steps}>
          {jutsu.steps.map((step, i) => {
            const sign = signOf(catalog, step.sign)
            return (
              <li key={step.step} className={styles.step}>
                <Reveal delay={(i % 2) * 0.08} className={styles.stepInner}>
                  <div className={styles.stepVisual}>
                    <span className={styles.stepNum} aria-hidden="true">
                      {step.step}
                    </span>
                    <SignArt
                      src={sign?.art ?? ''}
                      alt={`${sign?.name ?? step.sign} hand sign, line drawing`}
                      tint="color-mix(in srgb, var(--j) 28%, white)"
                      glow
                      className={styles.stepArt}
                    />
                  </div>
                  <div className={styles.stepBody}>
                    <p className={styles.stepLabel}>
                      Step {step.step} of {stepCount}
                    </p>
                    <h3 className={styles.stepName}>{signLabel(catalog, step.sign)}</h3>
                    {sign?.jp ? (
                      <p className={styles.stepJp} lang="ja">
                        {sign.jp}
                      </p>
                    ) : null}
                    <SignFacts sign={sign} />
                    {sign?.cues.length ? (
                      <ul className={styles.cues}>
                        {sign.cues.map((cue) => (
                          <li key={cue}>{cue}</li>
                        ))}
                      </ul>
                    ) : null}
                    <Button variant="ghost" size="sm" icon={<Expand />} onClick={() => setViewer(i)} className={styles.cardButton}>
                      View step card
                    </Button>
                  </div>
                </Reveal>
              </li>
            )
          })}
        </ol>
        <ArtCredit signs={signs} />
      </section>

      <section className={styles.detailSection} aria-labelledby="card-title">
        <SectionHeading
          id="card-title"
          eyebrow="Reference"
          title="The full sequence card"
          description="All four steps on one card, as printed in the SHINOBI AI reference sheets."
        />
        <Reveal>
          <button type="button" className={styles.sequenceCard} onClick={() => setViewer(stepCount)}>
            <img src={jutsu.sequence_image} alt={`${jutsu.title}: the full four-step sequence card`} loading="lazy" />
            <span className={styles.sequenceHint}>
              <Expand aria-hidden="true" /> Open full size
            </span>
          </button>
        </Reveal>
        <ArtCredit signs={signs} />
      </section>

      <nav className={styles.pager} aria-label="Other jutsu">
        <Link to={`/library/${prev.id}`} className={styles.pagerLink} style={jutsuStyle(prev)}>
          <ArrowLeft aria-hidden="true" />
          <span>
            <span className={styles.pagerHint}>Previous scroll</span>
            <span className={styles.pagerTitle}>{prev.title}</span>
          </span>
        </Link>
        <Link to={`/library/${next.id}`} className={`${styles.pagerLink} ${styles.pagerNext}`} style={jutsuStyle(next)}>
          <span>
            <span className={styles.pagerHint}>Next scroll</span>
            <span className={styles.pagerTitle}>{next.title}</span>
          </span>
          <ArrowRight aria-hidden="true" />
        </Link>
      </nav>

      <Lightbox
        image={viewing}
        onClose={() => setViewer(null)}
        onPrev={onStepCard ? () => setViewer((v) => ((v ?? 0) - 1 + stepCount) % stepCount) : undefined}
        onNext={onStepCard ? () => setViewer((v) => ((v ?? 0) + 1) % stepCount) : undefined}
        position={onStepCard && viewer !== null ? `${viewer + 1} / ${stepCount}` : undefined}
      />
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/library" className={styles.back}>
      <ArrowLeft aria-hidden="true" /> Jutsu Library
    </Link>
  )
}

export function LibraryPage() {
  const { jutsuId } = useParams()
  return jutsuId ? <JutsuDetail key={jutsuId} id={jutsuId} /> : <JutsuList />
}
