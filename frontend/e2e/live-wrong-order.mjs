// /live with a wrong-order recording (monkey, boar, then DOG instead of horse): the backend must
// report wrong_sign (expected horse, got dog) WITHOUT resetting Fire Style (its progress stays at 2
// steps), the UI shows the gentle note "HORSE not recognized — that looked like DOG", and no jutsu
// is activated. (Only a pause longer than the max gap resets a Live sequence: sequence_failed.)
import { check, launchEdge, openPage, readMarks, recordActivations, shot, sleep, startAndWaitLive, summary } from './lib.mjs'

const results = []
const browser = await launchEdge('wrong_order')
await recordActivations(browser)
try {
  const { page, log, socket } = await openPage(browser, '/live')
  await startAndWaitLive(page)
  const toastTexts = new Set()
  let shotTaken = false
  const deadline = Date.now() + 60_000 // ~4 loops of the 12.7 s fixture
  while (Date.now() < deadline) {
    const texts = await page.locator('[data-testid="failure-toast"]').allInnerTexts()
    for (const t of texts) toastTexts.add(t.replace(/\s+/g, ' ').trim())
    if (texts.length && !shotTaken) {
      shotTaken = true
      await page.screenshot({ path: shot('live-wrong-order-toast'), timeout: 180_000 })
    }
    if (await page.locator('[data-testid="jutsu-overlay"]').count()) break
    if (toastTexts.size && Date.now() > deadline - 30_000) break
    await sleep(200)
  }
  const failures = socket.events.filter((e) => e.type === 'wrong_sign')
  const jutsuEvents = socket.events.filter((e) => e.type === 'jutsu')
  console.log('backend wrong_sign events:', JSON.stringify(failures.map(({ at: _at, ...e }) => e)))
  console.log('toasts shown:', JSON.stringify([...toastTexts]))
  check(
    failures.some((e) => e.jutsu === 'fire_style' && e.step === 2 && e.expected === 'horse' && e.got === 'dog'),
    'backend reported wrong_sign for fire_style at step 2: expected horse, got dog (progress kept)',
    results,
  )
  check(
    [...toastTexts].some((t) => t.includes('HORSE not recognized — that looked like DOG')),
    'UI showed "HORSE not recognized — that looked like DOG"',
    results,
  )
  check(jutsuEvents.length === 0, `no jutsu event from the backend (${jutsuEvents.length})`, results)
  // never, not only at the end: the in-page record covers the whole run (also while screenshots ran)
  const { marks } = await readMarks(page)
  const shownNow = await page.locator('[data-testid="jutsu-overlay"], [data-testid="jutsu-banner"]').count()
  check(shownNow === 0 && marks.length === 0, `no activation overlay (${marks.length} shown during the run)`, results)
  const errors = log.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'))
  check(errors.length === 0, `no console errors (${errors.length})`, results)
  summary(results, { framesReceived: socket.frames, failures: failures.length })
} finally {
  await browser.close()
}
