import { BookOpen, House } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useDocumentTitle } from '../components/layout/useDocumentTitle'
import { Button } from '../components/ui'
import styles from './NotFoundPage.module.css'

export function NotFoundPage() {
  useDocumentTitle('Page not found')
  const { pathname } = useLocation()
  return (
    <section className={styles.page} aria-labelledby="notfound-title">
      <span className={styles.kanji} aria-hidden="true">
        迷
      </span>
      <p className={styles.code} aria-hidden="true">
        404
        <span className={styles.slash} />
      </p>
      <h1 id="notfound-title" className={styles.title}>
        This path leads nowhere
      </h1>
      <p className={styles.text}>
        Even a shinobi gets lost sometimes. There is no page at <span className={styles.path}>{pathname}</span>.
      </p>
      <div className={styles.actions}>
        <Button to="/" icon={<House />}>
          Back home
        </Button>
        <Button variant="secondary" to="/library" icon={<BookOpen />}>
          Jutsu Library
        </Button>
      </div>
    </section>
  )
}
