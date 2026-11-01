// The jutsu catalog (/api/jutsu) and server info (/api/info), loaded once and shared.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../services/api'
import type { Catalog, JutsuInfo } from '../types/catalog'
import type { JutsuId, ServerInfo } from '../types/protocol'

interface CatalogContextValue {
  catalog: Catalog | null
  info: ServerInfo | null
  loading: boolean
  /** user-facing message when the server could not be reached */
  error: string | null
  reload: () => void
  jutsu: (id: string | undefined) => JutsuInfo | undefined
}

const CatalogContext = createContext<CatalogContextValue | null>(null)

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const abort = new AbortController()
    Promise.all([api.catalog(abort.signal), api.info(abort.signal)])
      .then(([c, i]) => {
        setCatalog(c)
        setInfo(i)
      })
      .catch((e: unknown) => {
        if (abort.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false)
      })
    return () => abort.abort()
  }, [attempt])

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    setAttempt((n) => n + 1)
  }, [])
  const jutsu = useCallback(
    (id: string | undefined) => catalog?.jutsu.find((j) => j.id === (id as JutsuId)),
    [catalog],
  )
  const value = useMemo(
    () => ({ catalog, info, loading, error, reload, jutsu }),
    [catalog, info, loading, error, reload, jutsu],
  )
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

export function useCatalog(): CatalogContextValue {
  const value = useContext(CatalogContext)
  if (!value) throw new Error('useCatalog must be used inside <CatalogProvider>')
  return value
}
