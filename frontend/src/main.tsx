import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/inter'
import '@fontsource/bebas-neue'
import '@fontsource/rajdhani/500.css'
import '@fontsource/rajdhani/600.css'
import '@fontsource/rajdhani/700.css'
import '@fontsource/yuji-syuku'
import '@fontsource/caveat-brush'
import '@fontsource/permanent-marker'
import '@fontsource-variable/nunito'
import './konoha/konoha.css'
import './styles/global.css'
import App from './App'
import { CatalogProvider } from './contexts/CatalogContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { SoundProvider } from './contexts/SoundContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { MusicProvider } from './konoha/music/MusicContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <SettingsProvider>
          <SoundProvider>
            <MusicProvider>
              <CatalogProvider>
                <App />
              </CatalogProvider>
            </MusicProvider>
          </SoundProvider>
        </SettingsProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
