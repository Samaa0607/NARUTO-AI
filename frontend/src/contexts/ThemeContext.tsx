// Naruto / Sasuke visual theme. Only changes the look (CSS variables via <html data-theme>);
// it never changes recognition behaviour.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadJSON, saveJSON } from '../lib/storage'

export type ThemeId = 'naruto' | 'sasuke'
export const THEMES: ThemeId[] = ['naruto', 'sasuke']
const KEY = 'shinobi.theme'

interface ThemeContextValue {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function initialTheme(): ThemeId {
  const saved = loadJSON<string>(KEY)
  return saved === 'sasuke' || saved === 'naruto' ? saved : 'naruto'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    saveJSON(KEY, theme)
  }, [theme])

  const setTheme = useCallback((next: ThemeId) => setThemeState(next), [])
  const toggleTheme = useCallback(() => setThemeState((t) => (t === 'naruto' ? 'sasuke' : 'naruto')), [])
  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>')
  return value
}
