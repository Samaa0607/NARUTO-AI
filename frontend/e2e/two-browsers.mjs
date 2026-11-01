// Two separate Edge instances at the same time, different recordings: Fire Style in one, Chidori in
// the other. Each must get its own session and only its own jutsu.
import { check, launchEdge, openPage, shot, sleep, startAndWaitLive, summary } from './lib.mjs'

const results = []
const [a, b] = await Promise.all([launchEdge('fire_style'), launchEdge('chidori')])
try {
  const [pa, pb] = await Promise.all([openPage(a, '/live', { width: 1280, height: 800 }), openPage(b, '/live', { width: 1280, height: 800 })])
  await Promise.all([startAndWaitLive(pa.page, 150_000), startAndWaitLive(pb.page, 150_000)])
  const helloA = pa.socket.texts.find((t) => t.type === 'hello')
  const helloB = pb.socket.texts.find((t) => t.type === 'hello')
  check(helloA && helloB && helloA.session !== helloB.session, `two sessions: ${helloA?.session} / ${helloB?.session}`, results)

  const firedA = () => pa.socket.events.filter((e) => e.type === 'jutsu').map((e) => e.jutsu)
  const firedB = () => pb.socket.events.filter((e) => e.type === 'jutsu').map((e) => e.jutsu)
  const deadline = Date.now() + 150_000
  while (Date.now() < deadline && !(firedA().length && firedB().length)) await sleep(500)
  console.log('A (fire_style recording) jutsu events:', JSON.stringify(firedA()))
  console.log('B (chidori recording) jutsu events:', JSON.stringify(firedB()))
  const overlayA = await pa.page.locator('[data-testid="jutsu-overlay"], [data-testid="jutsu-banner"]').getAttribute('data-jutsu').catch(() => null)
  const overlayB = await pb.page.locator('[data-testid="jutsu-overlay"], [data-testid="jutsu-banner"]').getAttribute('data-jutsu').catch(() => null)
  await Promise.all([
    pa.page.screenshot({ path: shot('two-browsers-a-fire'), timeout: 180_000 }),
    pb.page.screenshot({ path: shot('two-browsers-b-chidori'), timeout: 180_000 }),
  ])
  check(firedA().length > 0 && firedA().every((j) => j === 'fire_style'), 'browser A got only Fire Style', results)
  check(firedB().length > 0 && firedB().every((j) => j === 'chidori'), 'browser B got only Chidori', results)
  console.log('overlay/banner at the end: A =', overlayA, ' B =', overlayB)
  const stepsA = new Set(pa.socket.events.filter((e) => e.type === 'step').map((e) => e.jutsu))
  const stepsB = new Set(pb.socket.events.filter((e) => e.type === 'step').map((e) => e.jutsu))
  console.log('jutsu with step events: A =', JSON.stringify([...stepsA]), ' B =', JSON.stringify([...stepsB]))
  summary(results, { framesA: pa.socket.frames, framesB: pb.socket.frames })
} finally {
  await Promise.all([a.close(), b.close()])
}
