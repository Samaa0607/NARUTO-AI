// Screenshots of /live, /practice and /practice/fire_style at the target viewports, with the camera
// running (live AI) or not, and a horizontal-overflow check at each size.
//
//   node e2e/responsive.mjs [live|idle]
import { check, launchEdge, noHorizontalScroll, openPage, shot, sleep, summary } from './lib.mjs'

const withCamera = (process.argv[2] ?? 'live') === 'live'
const VIEWPORTS = [
  [1440, 900],
  [1280, 800],
  [1180, 820],
  [820, 1180],
  [390, 844],
  [360, 740],
]
const ROUTES = withCamera ? ['/live', '/practice/fire_style'] : ['/live', '/practice', '/practice/shadow_clone']
const results = []
const browser = await launchEdge('fire_style')
try {
  for (const [width, height] of VIEWPORTS) {
    for (const route of ROUTES) {
      const { page, log } = await openPage(browser, route, { width, height })
      await page.waitForSelector('main h1, main h2', { timeout: 120_000 })
      if (withCamera) {
        await page.getByTestId('start-camera').click()
        await page.waitForSelector('[data-testid="camera-stage"][data-live="true"]', { timeout: 120_000 }).catch(() => null)
        await sleep(1500)
      } else {
        await sleep(800)
      }
      const name = `resp-${withCamera ? 'live' : 'idle'}-${route.replace(/\//g, '_').replace(/^_/, '')}-${width}x${height}`
      await page.screenshot({ path: shot(name), timeout: 180_000 })
      if (width <= 400) await page.screenshot({ path: shot(`${name}-full`), fullPage: true, timeout: 180_000 })
      check(await noHorizontalScroll(page), `${route} ${width}x${height}: no horizontal scrolling`, results)
      const errors = log.filter((l) => l.startsWith('[pageerror]'))
      if (errors.length) console.log(errors.join('\n'))
      await page.close()
    }
  }
  summary(results)
} finally {
  await browser.close()
}
