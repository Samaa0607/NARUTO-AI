// /live with a real recording as the camera: the steps advance and the activation overlay appears
// after the 4th sign, driven by the real backend. Timings come from an in-page record of the DOM
// (lib.mjs recordActivations), not from the polling loop: screenshots on a busy machine take seconds.
//
//   node e2e/live-jutsu.mjs fire_style      (fixture fire_style.y4m: monkey, boar, horse, tiger)
//   node e2e/live-jutsu.mjs chidori         (fixture chidori.y4m: snake, dog, tiger, monkey)
import {
  check,
  launchEdge,
  median,
  noHorizontalScroll,
  openPage,
  readMarks,
  readStats,
  recordActivations,
  sleep,
  snap,
  startAndWaitLive,
  summary,
} from './lib.mjs'

const jutsu = process.argv[2] ?? 'fire_style'
const effect = { fire_style: 'fire', chidori: 'chidori' }[jutsu]
const results = []
const browser = await launchEdge(jutsu)
await recordActivations(browser)
try {
  const { page, log, socket } = await openPage(browser, '/live')
  await page.waitForSelector('[data-testid="start-camera"]')
  await snap(page, `live-${jutsu}-0-idle`)
  const t0 = Date.now()
  await startAndWaitLive(page)
  const tLive = Date.now()
  check(true, `processed frames on the canvas after ${((tLive - t0) / 1000).toFixed(1)} s`, results)
  await snap(page, `live-${jutsu}-1-live`)

  // follow the big track while the fixture plays; collect every data-done value seen
  const seenDone = new Set()
  const stats = []
  let overlayAt = null
  const deadline = Date.now() + 120_000
  let shotSteps = new Set()
  while (Date.now() < deadline && overlayAt === null) {
    const state = await page.evaluate((id) => {
      const row = document.querySelector(`[data-testid="jutsu-row-${id}"]`)
      const track = document.querySelector(`[data-testid="sequence-track"][data-jutsu="${id}"]`)
      // when the overlay was really added to the page (in-page record), even if this poll comes late
      const mark = (window.__shinobiMarks ?? []).find((m) => m.what === 'jutsu-overlay' && m.jutsu === id)
      return { row: row ? Number(row.getAttribute('data-done')) : null, track: track ? Number(track.getAttribute('data-done')) : null, overlayShown: mark ? mark.shown : null }
    }, jutsu)
    if (state.track !== null) seenDone.add(state.track)
    // check the overlay before any (slow) screenshot
    if (state.overlayShown !== null) {
      overlayAt = state.overlayShown
      await snap(page, `live-${jutsu}-3-activation`)
      break
    }
    if (state.track && state.track > 0 && !shotSteps.has(state.track)) {
      shotSteps.add(state.track)
      await snap(page, `live-${jutsu}-2-step${state.track}`)
    }
    const s = await readStats(page)
    stats.push({ latency: parseFloat(s.latency), fps: parseFloat(s.fps) })
    await sleep(150)
  }
  // every step count the track showed (in-page record), also those shown while a screenshot ran
  const record = await readMarks(page)
  for (const s of record.steps) if (s.jutsu === jutsu) seenDone.add(s.done)
  const stepsSeen = [...seenDone].sort()
  check(stepsSeen.includes(1) && stepsSeen.includes(2) && stepsSeen.includes(3), `track showed steps 1, 2, 3 (seen ${JSON.stringify(stepsSeen)})`, results)
  check(overlayAt !== null, `activation overlay for ${jutsu} appeared${overlayAt ? ` ${((overlayAt - tLive) / 1000).toFixed(1)} s after going live` : ''}`, results)

  // the overlay must be backed by a real backend event
  const jutsuEvents = socket.events.filter((e) => e.type === 'jutsu')
  check(jutsuEvents.some((e) => e.jutsu === jutsu), `backend sent {"type":"jutsu","jutsu":"${jutsu}"} (events: ${JSON.stringify(jutsuEvents.map((e) => e.jutsu))})`, results)
  const steps = socket.events.filter((e) => e.type === 'step' && e.jutsu === jutsu).map((e) => `${e.step}:${e.sign}`)
  check(steps.length >= 3, `backend step events for ${jutsu}: ${JSON.stringify(steps)}`, results)
  if (overlayAt) {
    // the event this overlay answers: the last one that reached the page before it (the page gets the
    // socket frame slightly before Playwright reports it, hence the small tolerance)
    const ev = jutsuEvents.filter((e) => e.jutsu === jutsu && e.at <= overlayAt + 500).at(-1)
    check(ev && overlayAt - ev.at < 3000, `overlay followed the jutsu event (${ev ? overlayAt - ev.at : '?'} ms after it reached the page)`, results)
  }

  // The reveal always plays its full 2.2 s. If the backend ended the effect before that (Chidori and
  // Fire end at once when the hand leaves the picture), the overlay goes straight away after the
  // reveal, with no "active" banner; otherwise: reveal -> banner -> gone on effect_end.
  const REVEAL_MS = 2200
  let quickEnd = false
  if (overlayAt) {
    const evJ = jutsuEvents.filter((e) => e.jutsu === jutsu && e.at <= overlayAt + 500).at(-1)
    for (let i = 0; i < 100 && !socket.events.some((e) => e.type === 'effect_end' && e.effect === effect && evJ && e.at >= evJ.at); i++) await sleep(200)
    const end = socket.events.find((e) => e.type === 'effect_end' && e.effect === effect && evJ && e.at >= evJ.at)
    quickEnd = Boolean(end && evJ && end.at - evJ.at < REVEAL_MS)
    if (quickEnd) {
      const reveal = await page
        .waitForFunction(
          ({ id, after }) => (window.__shinobiMarks ?? []).find((m) => m.what === 'jutsu-overlay' && m.jutsu === id && m.shown >= after - 500 && m.gone !== null) ?? null,
          { id: jutsu, after: overlayAt },
          { timeout: 10_000, polling: 100 },
        )
        .then((h) => h.jsonValue())
        .catch(() => null)
      const lasted = reveal ? reveal.gone - reveal.shown : null
      check(
        lasted !== null && lasted >= REVEAL_MS - 300,
        `effect ended ${end.at - evJ.at} ms after the jutsu: the reveal still played in full (${lasted ?? '?'} ms) and then cleared`,
        results,
      )
    }
  }
  if (overlayAt && !quickEnd) {
    const banner = await page
      .waitForFunction(
        ({ id, after }) => (window.__shinobiMarks ?? []).find((m) => m.what === 'jutsu-banner' && m.jutsu === id && m.shown >= after) ?? null,
        { id: jutsu, after: overlayAt },
        { timeout: 8000, polling: 100 },
      )
      .then((h) => h.jsonValue())
      .catch(() => null)
    check(!!banner, `cinematic reveal collapsed into the "active" banner${banner ? ` (${banner.shown - overlayAt} ms after the reveal)` : ''}`, results)
    await sleep(1500)
    await snap(page, `live-${jutsu}-4-effect`)
    const removed = banner
      ? await page
          .waitForFunction(
            ({ id, shown }) => (window.__shinobiMarks ?? []).find((m) => m.what === 'jutsu-banner' && m.jutsu === id && m.shown === shown && m.gone !== null) ?? null,
            { id: jutsu, shown: banner.shown },
            { timeout: 20_000, polling: 200 },
          )
          .then((h) => h.jsonValue())
          .catch(() => null)
      : null
    const ends = socket.events.filter((e) => e.type === 'effect_end' && e.effect === effect)
    const endedFirst = removed !== null && ends.some((e) => e.at >= banner.shown && e.at <= removed.gone + 500)
    check(
      endedFirst,
      `banner removed after the backend's effect_end (${ends.length} effect_end for ${effect}${removed ? `, banner gone ${removed.gone - banner.shown} ms after it appeared` : ', banner still shown'})`,
      results,
    )
  }

  const lat = median(stats.map((s) => s.latency))
  const fps = median(stats.map((s) => s.fps))
  check(await noHorizontalScroll(page), 'no horizontal scrolling at 1440x900', results)
  const errors = log.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'))
  check(errors.length === 0, `no console errors (${errors.length})${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`, results)
  summary(results, {
    jutsu,
    framesReceived: socket.frames,
    framesSent: socket.sentFrames,
    medianLatencyMs: lat,
    medianServerFps: fps,
    mode: socket.sentTexts.filter((t) => t.type === 'mode'),
  })
} finally {
  await browser.close()
}
