// Shared helpers for the real end-to-end tests: installed Microsoft Edge (playwright-core) with a
// fake camera that plays a .y4m built from the user's recordings (e2e/make_fixtures.py), against the
// real backend (python -m shinobi.server) through the Vite dev server.
//
//   SHINOBI_WEB       app URL                      (default http://localhost:5173)
//   SHINOBI_FIXTURES  folder with the .y4m files   (required: OUTSIDE the repository)
//   SHINOBI_E2E_OUT   folder for screenshots       (default: SHINOBI_FIXTURES)
import { chromium } from 'playwright-core'
import path from 'node:path'

export const BASE = process.env.SHINOBI_WEB ?? 'http://localhost:5173'
export const FIXTURES = process.env.SHINOBI_FIXTURES
export const OUT = process.env.SHINOBI_E2E_OUT ?? FIXTURES
if (!FIXTURES) throw new Error('set SHINOBI_FIXTURES to the folder with the .y4m fake-camera files')

export const fixture = (name) => path.join(FIXTURES, `${name}.y4m`)
export const shot = (name) => path.join(OUT, `${name}.png`)

const EDGE_FLAGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  // busy Windows machine: skip proxy auto-detection and Edge's background services, which made
  // every launch / first request take tens of seconds
  '--no-proxy-server',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-sync',
  '--no-first-run',
  '--no-default-browser-check',
]

/**
 * A separate Edge instance (own persistent profile in OUT/profiles/<profile>, reused between runs)
 * whose fake camera plays `fixtureName` (looping). Returns a BrowserContext: close() ends that Edge.
 */
export async function launchEdge(fixtureName, { headless = true, profile } = {}) {
  const args = [...EDGE_FLAGS]
  if (fixtureName) args.push(`--use-file-for-fake-video-capture=${fixture(fixtureName)}`)
  const dir = path.join(OUT, 'profiles', profile ?? fixtureName ?? 'default')
  return chromium.launchPersistentContext(dir, {
    channel: 'msedge',
    headless,
    args,
    viewport: { width: 1440, height: 900 },
    permissions: ['camera'],
  })
}

/** Records what the backend really sent on the /ws socket (FrameState events, hello, mode...). */
export function recordSocket(page) {
  const rec = { frames: 0, events: [], texts: [], sentFrames: 0, sentTexts: [], sockets: 0, last: null, progress: [] }
  page.on('websocket', (ws) => {
    if (!new URL(ws.url()).pathname.endsWith('/ws')) return // ignore Vite's HMR socket
    rec.sockets += 1
    ws.on('framereceived', ({ payload }) => {
      if (typeof payload === 'string') {
        try {
          rec.texts.push({ at: Date.now(), ...JSON.parse(payload) })
        } catch {
          rec.texts.push({ at: Date.now(), raw: payload })
        }
        return
      }
      const n = payload.readUInt32BE(0)
      const header = JSON.parse(payload.subarray(4, 4 + n).toString('utf8'))
      rec.frames += 1
      rec.last = header
      rec.progress.push({ at: Date.now(), mode: header.mode, progress: header.progress ?? {}, timeLeft: header.time_left ?? null, perJutsu: header.time_left_per_jutsu ?? null, fps: header.fps ?? null, ready: header.ready ?? null })
      for (const ev of header.events ?? []) rec.events.push({ at: Date.now(), ...ev })
    })
    ws.on('framesent', ({ payload }) => {
      if (typeof payload === 'string') rec.sentTexts.push(JSON.parse(payload))
      else rec.sentFrames += 1
    })
  })
  return rec
}

export async function openPage(context, route, viewport = { width: 1440, height: 900 }) {
  const page = await context.newPage()
  await page.setViewportSize(viewport)
  const log = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log.push(`[${m.type()}] ${m.text()}`)
  })
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`))
  const socket = recordSocket(page)
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 180_000 })
  await waitForRendering(page)
  return { context, page, log, socket }
}

/**
 * A fresh headless Edge on this (busy) machine can paint no frame at all for a minute or more after
 * its first navigation (measured: 0 animation frames in 15 s on / as well as on /live, then a steady
 * 60 fps). Screenshots and Playwright's "stable" click checks wait for frames, so start only once
 * the page renders at a normal pace: 10 animation frames within 1.5 s.
 */
export async function waitForRendering(page, timeout = 240_000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const ms = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const t0 = performance.now()
          let n = 0
          const step = () => (++n >= 10 ? resolve(performance.now() - t0) : requestAnimationFrame(step))
          requestAnimationFrame(step)
          setTimeout(() => resolve(Number.POSITIVE_INFINITY), 5000)
        }),
    )
    if (ms < 1500) return true
  }
  console.log(`note: the page still paints slowly after ${timeout / 1000} s`)
  return false
}

/** Click "Start camera" and wait until processed frames from the server are on the canvas. */
export async function startAndWaitLive(page, timeout = 90_000) {
  await page.getByTestId('start-camera').click()
  await page.waitForSelector('[data-testid="camera-stage"][data-live="true"]', { timeout })
}

export async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
}

/** Samples latency / fps shown by the UI every `everyMs` while `until()` is false. */
export async function readStats(page) {
  return page.evaluate(() => ({
    latency: document.querySelector('[data-testid="stat-latency"]')?.textContent ?? null,
    fps: document.querySelector('[data-testid="stat-fps"]')?.textContent ?? null,
  }))
}

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length / 2)] : null
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function check(cond, message, results) {
  results.push({ ok: !!cond, message })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${message}`)
}

export function summary(results, extra = {}) {
  const failed = results.filter((r) => !r.ok)
  console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, ...extra }, null, 2))
  process.exitCode = failed.length ? 1 : 0
}

/**
 * In-page record (MutationObserver, Date.now() of the page, from the first paint on) of every
 * appearance / removal of the activation overlay and the "active" banner, and of every step count
 * the sequence track showed. Screenshots on a busy machine take seconds (and stall the page), so a
 * polling loop alone can miss a 2 s reveal or a step, or stamp them late; this record cannot.
 * Call before opening the page; read it with readMarks(page).
 */
export async function recordActivations(context) {
  await context.addInitScript(() => {
    const marks = []
    const steps = []
    const open = new Map()
    window.__shinobiMarks = marks
    window.__shinobiSteps = steps
    let lastStep = null
    const scan = () => {
      const now = Date.now()
      const seen = new Set()
      for (const el of document.querySelectorAll('[data-testid="jutsu-overlay"], [data-testid="jutsu-banner"]')) {
        const key = `${el.getAttribute('data-testid')}|${el.getAttribute('data-jutsu')}`
        seen.add(key)
        if (!open.has(key)) {
          const mark = { what: el.getAttribute('data-testid'), jutsu: el.getAttribute('data-jutsu'), shown: now, gone: null }
          marks.push(mark)
          open.set(key, mark)
        }
      }
      for (const [key, mark] of open) {
        if (!seen.has(key)) {
          mark.gone = now
          open.delete(key)
        }
      }
      const track = document.querySelector('[data-testid="sequence-track"]')
      const step = track ? `${track.getAttribute('data-jutsu')}|${track.getAttribute('data-done')}` : null
      if (step && step !== lastStep) steps.push({ jutsu: track.getAttribute('data-jutsu'), done: Number(track.getAttribute('data-done')), at: now })
      lastStep = step
    }
    new MutationObserver(scan).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-testid', 'data-jutsu', 'data-done'],
    })
  })
}

/** What recordActivations saw so far: { marks: [{ what, jutsu, shown, gone }], steps: [{ jutsu, done, at }] }. */
export async function readMarks(page) {
  return page.evaluate(() => ({ marks: window.__shinobiMarks ?? [], steps: window.__shinobiSteps ?? [] }))
}

/**
 * Evidence screenshot. On a busy machine one can take tens of seconds; it proves nothing by itself
 * (every check reads the page or the socket), so it gets a long timeout and a failure is only logged.
 */
export async function snap(page, name) {
  const started = Date.now()
  try {
    await page.screenshot({ path: shot(name), timeout: 120_000 })
  } catch (e) {
    console.log(`note: screenshot ${name} failed after ${Date.now() - started} ms (${e.message.split('\n')[0]})`)
  }
}
