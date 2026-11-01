# SHINOBI AI — web frontend

React + TypeScript + Vite. It is only the interface: every recognition result and every jutsu
activation comes from the Python backend (`python -m shinobi.server`) over the WebSocket described
in [`../docs/web_protocol.md`](../docs/web_protocol.md).

## Run

```powershell
# 1) the Python backend (from the project root)
.venv\Scripts\python.exe -m shinobi.server

# 2a) development: hot reload on http://localhost:5173 (proxies /api, /ws, /references, /audio to :8000)
cd frontend
npm install
npm run dev

# 2b) or build once; the backend then serves the app itself on http://localhost:8000
npm run build
```

| command | what it does |
|---|---|
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | type-check (`tsc -b`) + production build into `dist/` |
| `npm run typecheck` | type-check only |
| `npm run lint` | oxlint |
| `npm test` | unit tests (Vitest) |

## Structure

```
src/
  types/        protocol.ts (WebSocket contract), catalog.ts (REST data)
  services/     api.ts (REST), socket client
  contexts/     Theme (Naruto/Sasuke), Settings (localStorage), Catalog (/api/jutsu), Sound
  audio/        cues.ts (the 19 sound files) + the audio engine
  hooks/        camera, session
  components/   ui/ (Button, Panel, Badge...), layout/ (app shell, navigation), live/ (camera stage, recognition panel...)
  pages/        Home, Live Demo, Practice, Library, Settings, About
  styles/       tokens.css (design tokens, both themes), global.css
```

Camera access needs a secure context: `http://localhost` works; from another device on the LAN the
backend must run with HTTPS (see `docs/web_protocol.md`).
