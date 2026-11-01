// The jutsu sounds end to end, in a real browser against the real backend: the fake camera plays a real
// recording on /live; an init script logs every backend frame (its events) and every sound the page
// starts (which file, when). Each sound must have the backend event that causes it:
//   hand-sign tone + accent  <- a `step` event, or the `jutsu` event (the last sign) on a timeline server
//   charge                   <- effect_phase charge
//   release / impact / loop  <- effect_phase release (or `jutsu` on a server without the timeline)
//   ending                   <- effect_stopping       poof <- clones / effect_stopping
//   timeout cue              <- sequence_failed/timeout     voice <- jutsu / effect_phase name
// and nothing may sound for idle frames or wrong signs; no step sounds twice. With the timeline it also
// checks the order: confirmation -> charge -> name -> release.
//
//   node e2e/audio-timeline.mjs [fixture ...]    (default: fire_style chidori shadow_clone rasengan)
import { check, launchEdge, openPage, sleep, startAndWaitLive, summary } from './lib.mjs'

const PROBE = () => {
  const log = (window.__audioLog = [])
  const t = () => Math.round(performance.now() * 10) / 10
  const urlOfBytes = new WeakMap()
  const urlOfBuffer = new WeakMap()
  const origFetch = window.fetch
  window.fetch = async function (input, init) {
    const res = await origFetch.call(this, input, init)
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const ab = res.arrayBuffer.bind(res)
    res.arrayBuffer = async () => {
      const bytes = await ab()
      urlOfBytes.set(bytes, url)
      return bytes
    }
    return res
  }
  const origDecode = BaseAudioContext.prototype.decodeAudioData
  BaseAudioContext.prototype.decodeAudioData = function (bytes, ...rest) {
    const url = urlOfBytes.get(bytes)
    return origDecode.call(this, bytes, ...rest).then(
      (buffer) => {
        if (url) urlOfBuffer.set(buffer, url)
        log.push({ kind: 'decoded', perf: t(), url: url || '?' })
        return buffer
      },
      (err) => {
        log.push({ kind: 'decode-failed', perf: t(), url: url || '?', err: String(err) })
        throw err
      },
    )
  }
  const origStart = AudioBufferSourceNode.prototype.start
  AudioBufferSourceNode.prototype.start = function (when = 0, ...rest) {
    log.push({ kind: 'start', perf: t(), url: urlOfBuffer.get(this.buffer) || '?', delayMs: Math.round(Math.max(0, when - this.context.currentTime) * 1000), state: this.context.state })
    return origStart.call(this, when, ...rest)
  }
  const OrigWS = window.WebSocket
  function ProbeWS(url, protocols) {
    const ws = protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols)
    ws.addEventListener('message', (e) => {
      const at = t()
      const handle = (buf) => {
        try {
          const n = new DataView(buf).getUint32(0)
          const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)))
          if (head.type === 'frame') log.push({ kind: 'frame', perf: at, seq: head.seq, events: head.events || [], phase: head.effect && head.effect.phase })
        } catch {
          // not a frame
        }
      }
      if (e.data instanceof ArrayBuffer) handle(e.data)
      else if (e.data instanceof Blob) e.data.arrayBuffer().then(handle)
    })
    return ws
  }
  ProbeWS.prototype = OrigWS.prototype
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) ProbeWS[k] = OrigWS[k]
  window.WebSocket = ProbeWS
}

const file = (url) => (url || '?').replace(/^.*\/audio\//, '')
function kindOf(url) {
  const f = file(url)
  if (f === 'ui/hand_seal.wav' || f === 'ui/step_success.wav' || f.endsWith('/hand_sign.wav')) return 'sign'
  if (f.startsWith('jutsu_music/')) return 'music' // checked by e2e/music-flow.mjs
  if (f === 'ui/sequence_failed.wav') return 'timeout'
  if (f.startsWith('voice/')) return f.endsWith('/name.wav') ? 'voice-name' : 'voice-activation'
  if (/prepare_inhale|charge_rise|lightning_charge|charge_chakra|charge_magic|chakra_charge|seal_charge/.test(f)) return 'charge'
  if (f.includes('smoke_poof')) return 'poof'
  if (/chidori\/impact\.wav|rasengan\/impact\.wav|clone_disappear/.test(f)) return 'ending'
  return 'release'
}
function canCause(frame, kind, timeline) {
  const ev = frame.events
  const has = (pred) => ev.some(pred)
  switch (kind) {
    case 'sign': return has((e) => e.type === 'step') || (timeline && has((e) => e.type === 'jutsu'))
    case 'charge': return has((e) => e.type === 'effect_phase' && e.phase === 'charge')
    case 'release': return has((e) => e.type === 'effect_phase' && e.phase === 'release') || (!timeline && has((e) => e.type === 'jutsu'))
    case 'ending': return has((e) => e.type === 'effect_stopping')
    case 'poof': return has((e) => e.type === 'clones' || e.type === 'effect_stopping')
    case 'timeout': return has((e) => e.type === 'sequence_failed' && e.reason === 'timeout')
    case 'voice-activation': return has((e) => e.type === 'jutsu')
    case 'voice-name': return has((e) => e.type === 'effect_phase' && e.phase === 'name') || (!timeline && has((e) => e.type === 'jutsu'))
    default: return false
  }
}

async function runFixture(name, results) {
  const browser = await launchEdge(name, { profile: `audio-${name}` })
  await browser.addInitScript(PROBE)
  try {
    const { page } = await openPage(browser, '/live')
    await startAndWaitLive(page) // the click on Start camera is the user gesture that unlocks audio
    const deadline = Date.now() + 75_000
    let ended = false
    while (Date.now() < deadline && !ended) {
      await sleep(1000)
      ended = await page.evaluate(() => window.__audioLog.some((e) => e.kind === 'frame' && e.events.some((x) => x.type === 'effect_end')))
    }
    await sleep(1500)
    const log = await page.evaluate(() => window.__audioLog)
    const frames = log.filter((e) => e.kind === 'frame')
    const starts = log.filter((e) => e.kind === 'start')
    const decoded = log.filter((e) => e.kind === 'decoded').length
    const failed = log.filter((e) => e.kind === 'decode-failed')
    const timeline = frames.some((f) => f.events.some((e) => e.type === 'jutsu' && e.stages))
    const unmatched = []
    const latency = []
    const bySeq = new Map()
    for (const s of starts) {
      const kind = kindOf(s.url)
      if (kind === 'music') continue // the sequence music follows the progress, not one event (music-flow.mjs)
      let owner = null
      for (const f of frames) if (f.perf <= s.perf + 0.5 && s.perf - f.perf <= 2000 && canCause(f, kind, timeline)) owner = f
      if (!owner) {
        unmatched.push(`${file(s.url)} (${kind})`)
        continue
      }
      latency.push(s.perf - owner.perf)
      if (!bySeq.has(owner.seq)) bySeq.set(owner.seq, [])
      bySeq.get(owner.seq).push(kind)
    }
    // one tone + one accent per confirmed sign; nothing on wrong signs or idle frames
    let steps = 0
    let doubled = 0
    let wrongLoud = 0
    for (const f of frames) {
      const kinds = bySeq.get(f.seq) ?? []
      const signs = kinds.filter((k) => k === 'sign').length
      const isSign = f.events.some((e) => e.type === 'step') || (timeline && f.events.some((e) => e.type === 'jutsu'))
      if (isSign) {
        steps += 1
        if (signs !== 2) doubled += 1
      }
      if (f.events.some((e) => e.type === 'wrong_sign') && !isSign && kinds.length) wrongLoud += 1
    }
    const at = (pred) => frames.find((f) => f.events.some(pred))?.perf
    // position in the backend's event stream (frame by frame, in each frame's order): a slow frame may
    // carry two phases at once (the server still reports a skipped stage, in order), so the ORDER is
    // checked on this index and the times are only reported
    const flat = frames.flatMap((f) => f.events)
    const pos = (pred) => flat.findIndex(pred)
    const tJ = at((e) => e.type === 'jutsu')
    const tC = at((e) => e.type === 'effect_phase' && e.phase === 'charge')
    const tN = at((e) => e.type === 'effect_phase' && e.phase === 'name')
    const tR = at((e) => e.type === 'effect_phase' && e.phase === 'release')
    const files = [...new Set(starts.map((s) => file(s.url)))]
    console.log(`\n=== ${name}: ${frames.length} frames, timeline ${timeline ? 'yes' : 'no (older server)'}, ${decoded} sounds decoded`)
    if (timeline && tJ) console.log(`   jutsu -> charge ${((tC - tJ) / 1000).toFixed(2)} s -> name ${((tN - tJ) / 1000).toFixed(2)} s -> release ${((tR - tJ) / 1000).toFixed(2)} s`)
    console.log(`   sounds started: ${files.join(', ')}`)
    check(failed.length === 0, `${name}: every sound decoded in the browser (${failed.map((f) => file(f.url)).join(', ') || 'no failures'})`, results)
    check(steps > 0 && doubled === 0, `${name}: ${steps} confirmed signs, each with exactly its tone + accent`, results)
    check(wrongLoud === 0, `${name}: wrong signs silent`, results)
    check(unmatched.length === 0, `${name}: no sound without its backend event${unmatched.length ? `: ${unmatched.join(', ')}` : ''}`, results)
    check(starts.some((s) => kindOf(s.url) === 'release'), `${name}: the release sounds played`, results)
    if (timeline) {
      const [iJ, iC, iN, iR] = [
        pos((e) => e.type === 'jutsu'),
        pos((e) => e.type === 'effect_phase' && e.phase === 'charge'),
        pos((e) => e.type === 'effect_phase' && e.phase === 'name'),
        pos((e) => e.type === 'effect_phase' && e.phase === 'release'),
      ]
      check(iJ >= 0 && iJ < iC && iC < iN && iN < iR, `${name}: confirmation -> charge -> name -> release, in order`, results)
      check(starts.some((s) => kindOf(s.url) === 'charge'), `${name}: the charge sound played in the charge phase`, results)
    }
    const sorted = latency.sort((a, b) => a - b)
    console.log(`   event -> sound: median ${Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0)} ms, max ${Math.round(sorted[sorted.length - 1] ?? 0)} ms`)
  } finally {
    await browser.close()
  }
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : ['fire_style', 'chidori', 'shadow_clone', 'rasengan']
const results = []
for (const name of names) await runFixture(name, results)
summary(results)
