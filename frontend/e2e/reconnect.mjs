// Stop the backend while a session is live, check the UI says so (reconnecting / offline, no
// recognition shown), start it again and check the session recovers by itself.
//
// Stops ONLY the process listening on SHINOBI_PORT (default 8000, this test's own server) and
// restarts it (python -m shinobi.server --port SHINOBI_PORT), leaving it running at the end.
import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { OUT, check, launchEdge, openPage, shot, sleep, startAndWaitLive, summary } from './lib.mjs'

const PORT = Number(process.env.SHINOBI_PORT ?? 8000)
const ROOT = path.resolve(import.meta.dirname, '..', '..')

function listenerPid(port) {
  const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' })
  const line = out.split(/\r?\n/).find((l) => l.includes('LISTENING') && new RegExp(`[:.]${port}\\s`).test(l))
  return line ? Number(line.trim().split(/\s+/).pop()) : null
}

function startServer() {
  const log = fs.openSync(path.join(OUT, 'server-restarted.log'), 'a')
  const child = spawn(path.join(ROOT, '.venv', 'Scripts', 'python.exe'), ['-u', '-m', 'shinobi.server', '--port', String(PORT)], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
  })
  child.unref()
  return child.pid
}

const results = []
const browser = await launchEdge('idle')
try {
  const { page, socket } = await openPage(browser, '/live')
  await startAndWaitLive(page)
  const firstHello = socket.texts.find((t) => t.type === 'hello')
  check(!!firstHello, `live with session ${firstHello?.session}`, results)

  const pid = listenerPid(PORT)
  check(pid !== null, `backend on port ${PORT} has pid ${pid}`, results)
  execSync(`taskkill /PID ${pid} /T /F`)
  const killedAt = Date.now()

  const states = []
  let offlineShot = false
  while (Date.now() - killedAt < 25_000) {
    const s = await page.evaluate(() => ({
      state: document.querySelector('[data-testid="camera-stage"]')?.getAttribute('data-ai-state'),
      live: document.querySelector('[data-testid="camera-stage"]')?.getAttribute('data-live'),
      badge: !!document.querySelector('[data-testid="ai-offline-badge"]'),
      panelOffline: !!document.querySelector('[data-testid="recognition-offline"]'),
      sign: !!document.querySelector('[data-testid="current-sign"]'),
    }))
    if (states[states.length - 1]?.state !== s.state) states.push({ t: Date.now() - killedAt, ...s })
    if (s.state === 'offline' && !offlineShot) {
      offlineShot = true
      await page.screenshot({ path: shot('reconnect-offline'), timeout: 180_000 })
    }
    if (s.state === 'offline') break
    await sleep(200)
  }
  console.log('states after the server stopped:', JSON.stringify(states))
  check(states.some((s) => s.state === 'reconnecting'), 'went to "reconnecting"', results)
  check(states.some((s) => s.state === 'offline'), 'then "offline" after repeated failures', results)
  check(states.filter((s) => s.state !== 'connected').every((s) => s.live === 'false' && s.badge && s.panelOffline && !s.sign),
    'while not connected: local preview + offline badge, no recognition UI', results)

  const newPid = startServer()
  const restartedAt = Date.now()
  console.log(`restarted the backend (pid ${newPid})`)
  const recovered = await page
    .waitForSelector('[data-testid="camera-stage"][data-live="true"]', { timeout: 120_000 })
    .then(() => true)
    .catch(() => false)
  const recoverS = (Date.now() - restartedAt) / 1000
  check(recovered, `recovered by itself ${recoverS.toFixed(1)} s after the restart`, results)
  const hellos = socket.texts.filter((t) => t.type === 'hello')
  check(hellos.length >= 2 && hellos[hellos.length - 1].session !== firstHello?.session, `new session ${hellos[hellos.length - 1]?.session}`, results)
  const modes = socket.sentTexts.filter((t) => t.type === 'mode')
  check(modes.length >= 2, `mode sent again after reconnecting (${modes.length} mode messages)`, results)
  await page.screenshot({ path: shot('reconnect-recovered'), timeout: 180_000 })
  summary(results, { recoverSeconds: recoverS })
} finally {
  await browser.close()
}
