// Practice Mode for one jutsu with its real recording: "Step N of 4" advances one step at a time
// (only on backend progress) and the completion appears on the backend's `jutsu` event.
//
//   node e2e/practice.mjs fire_style
import { check, launchEdge, noHorizontalScroll, openPage, shot, sleep, startAndWaitLive, summary } from './lib.mjs'

const jutsu = process.argv[2] ?? 'fire_style'
const results = []
const browser = await launchEdge(jutsu)
try {
  const { page, log, socket } = await openPage(browser, `/practice/${jutsu}`)
  await page.waitForSelector('[data-testid="practice-step"]', { timeout: 120_000 })
  // the kicker is drawn in capitals (CSS text-transform), and innerText returns what is shown
  const stepText = async () => (await page.getByTestId('practice-step').innerText().catch(() => '')).trim().toLowerCase()
  check((await stepText()) === 'step 1 of 4', 'starts at "Step 1 of 4"', results)
  await startAndWaitLive(page)
  const modeSent = socket.sentTexts.find((t) => t.type === 'mode')
  check(modeSent?.mode === 'practice' && modeSent?.jutsu === jutsu, `sent mode ${JSON.stringify(modeSent)}`, results)

  const seen = []
  let completeAt = null
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const done = await page.getByTestId('practice-complete').count()
    if (done) {
      completeAt = Date.now()
      await page.screenshot({ path: shot(`practice-${jutsu}-complete`), timeout: 180_000 })
      break
    }
    const text = await stepText()
    if (text && seen[seen.length - 1] !== text) {
      seen.push(text)
      await page.screenshot({ path: shot(`practice-${jutsu}-${text.replace(/\s+/g, '-').toLowerCase()}`), timeout: 180_000 })
    }
    await sleep(150)
  }
  console.log('steps shown in order:', JSON.stringify(seen))
  const expected = ['step 1 of 4', 'step 2 of 4', 'step 3 of 4', 'step 4 of 4']
  check(expected.every((s) => seen.includes(s)), 'showed Step 1, 2, 3, 4 of 4', results)
  check(
    seen.every((s, i) => i === 0 || Number(s.split(' ')[1]) === Number(seen[i - 1].split(' ')[1]) + 1 || Number(s.split(' ')[1]) === 1),
    'advanced one step at a time (or back to step 1 after a reset)',
    results,
  )
  const ev = socket.events.find((e) => e.type === 'jutsu' && e.jutsu === jutsu)
  check(completeAt !== null && !!ev, `completion shown${ev && completeAt ? ` ${completeAt - ev.at} ms after the backend's jutsu event` : ''}`, results)
  const stepEvents = socket.events.filter((e) => e.type === 'step').map((e) => `${e.jutsu}:${e.step}`)
  check(stepEvents.every((s) => s.startsWith(`${jutsu}:`)), `practice mode only reported ${jutsu} steps (${JSON.stringify(stepEvents)})`, results)

  // Retry: sends reset; the coach goes back to step 1 (after the next frames)
  if (completeAt) {
    await page.getByTestId('retry').click()                    // "Practise again" once complete
    const resetSent = socket.sentTexts.some((t) => t.type === 'reset')
    check(resetSent, 'Practise again sent {"type":"reset"}', results)
  }
  check(await noHorizontalScroll(page), 'no horizontal scrolling', results)
  const errors = log.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'))
  check(errors.length === 0, `no console errors (${errors.length})${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`, results)
  summary(results, { jutsu, framesReceived: socket.frames })
} finally {
  await browser.close()
}
