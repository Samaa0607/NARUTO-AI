import { Route, Routes } from 'react-router-dom'
import { KonohaShell } from './konoha/KonohaShell'
import { KonohaJutsuPage } from './konoha/pages/JutsuPage'
import { KonohaPracticePage } from './konoha/pages/PracticePage'
import { KonohaSettingsPage } from './konoha/pages/SettingsPage'
import { LegacyFrame } from './konoha/shell/LegacyFrame'
import { AboutPage } from './pages/AboutPage'
import { HomePage } from './pages/HomePage'
import { LiveDemoPage } from './pages/LiveDemoPage'
import { NotFoundPage } from './pages/NotFoundPage'

// The older dark pages (pages/PracticePage, LibraryPage, SettingsPage) stay in the repo; the routes
// now use their light Konoha versions in konoha/pages/.
export default function App() {
  return (
    <Routes>
      <Route element={<KonohaShell />}>
        <Route index element={<HomePage />} />
        <Route path="live" element={<LiveDemoPage />} />
        <Route path="practice" element={<KonohaPracticePage />} />
        <Route path="practice/:jutsuId" element={<KonohaPracticePage />} />
        <Route path="library" element={<KonohaJutsuPage />} />
        <Route path="library/:jutsuId" element={<KonohaJutsuPage />} />
        <Route path="settings" element={<KonohaSettingsPage />} />
        {/* not redesigned (not in the requested set): old dark pages inside a dark panel */}
        <Route element={<LegacyFrame />}>
          <Route path="about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
