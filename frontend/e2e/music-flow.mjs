// The jutsu sequence music and the hand-seal sounds, in a real browser against the real backend: the fake
// camera plays a real recording on /live; an init script records, from the outside, the Web Audio graph
// (which file each source plays, which node feeds which), every gain automation and every backend frame.
// Per jutsu it checks:
//   - a track only starts while its jutsu leads (most steps), with a 1.5 s fade-in (nothing playing) or a
//     0.8 s crossfade; the performed jutsu's own track is the one playing when the sequence completes
//   - one hand seal per confirmed step (and the last sign at `jutsu`), none for a wrong sign
//   - the music ducks under the activation build-up and fades out at the release (the source stops)
// plus: a wrong sign keeps the music going (live_wrong_keep), and stopping the camera fades it out.
//
//   node e2e/music-flow.mjs [case ...]    cases: fire_style chidori shadow_clone rasengan wrong_keep camera_stop
import { check, launchEdge, openPage, sleep, startAndWaitLive, summary } from './lib.mjs'

const PROBE = () => {
  const log = (window.__musicLog = [])
  const t = () => Math.round(performance.now() * 10) / 10
  const ids = new WeakMap()
  let next = 0
  const id = (node) => {
    if (!ids.has(node)) ids.set(node, ++next)
    return ids.get(node)
  }
  const owner = new WeakMap() // AudioParam -> gain node id
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
    return origDecode.call(this, bytes, ...rest).then((buffer) => {
      if (url) urlOfBuffer.set(buffer, url)
      return buffer
    })
  }
  const origCreateGain = BaseAudioContext.prototype.createGain
  BaseAudioContext.prototype.createGain = function () {
    const g = origCreateGain.call(this)
    owner.set(g.gain, { node: id(g), ctx: this })
    return g
  }
  const origConnect = AudioNode.prototype.connect
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest instanceof AudioNode) log.push({ kind: 'edge', from: id(this), to: id(dest) })
    return origConnect.call(this, dest, ...rest)
  }
  for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'setTargetAtTime', 'cancelAndHoldAtTime', 'cancelScheduledValues']) {
    const orig = AudioParam.prototype[m]
    AudioParam.prototype[m] = function (...args) {
      const o = owner.get(this)
      if (o) log.push({ kind: 'param', node: o.node, m, args, now: o.ctx.currentTime, perf: t() })
      return orig.apply(this, args)
    }
  }
  const origStart = AudioBufferSourceNode.prototype.start
  AudioBufferSourceNode.prototype.start = function (when = 0, ...rest) {
    log.push({ kind: 'start', node: id(this), perf: t(), url: urlOfBuffer.get(this.buffer) || '?', loop: this.loop })
    return origStart.call(this, when, ...rest)
  }
  const origStop = AudioScheduledSourceNode.prototype.stop
  AudioScheduledSourceNode.prototype.stop = function (when = 0) {
    log.push({ kind: 'stop', node: id(this), when, now: this.context.currentTime, perf: t() })
    return origStop.call(this, when)
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
          if (head.type === 'frame') log.push({ kind: 'frame', perf: at, events: head.events || [], progress: head.progress || {} })
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
const GAIN = { rasengan: 0.87, fire_style: 1.2, chidori: 0.93, shadow_clone: 1.35 } // src/audio/jutsuMusic.ts TRACKS

/** what happened to the music, from the recorded graph */
function analyse(log) {
  const frames = log.filter((e) => e.kind === 'frame')
  const edges = log.filter((e) => e.kind === 'edge')
  const params = log.filter((e) => e.kind === 'param')
  const out = (node) => edges.filter((e) => e.from === node).map((e) => e.to)
  const tracks = log
    .filter((e) => e.kind === 'start' && file(e.url).startsWith('jutsu_music/'))
    .map((s) => {
      const gain = out(s.node)[0]
      const duck = gain ? out(gain)[0] : undefined
      return {
        ...s,
        jutsu: file(s.url).replace('jutsu_music/', '').replace('.wav', ''),
        gainCalls: params.filter((p) => p.node === gain),
        duckCalls: params.filter((p) => p.node === duck),
        stops: log.filter((e) => e.kind === 'stop' && e.node === s.node),
      }
    })
  const seals = log.filter((e) => e.kind === 'start' && file(e.url) === 'ui/hand_seal.wav')
  const firstFrame = (pred) => frames.find((f) => f.events.some(pred))
  return { frames, tracks, seals, firstFrame }
}

function sealsPerSign(frames, seals) {
  // each seal must follow a frame with a step (or the jutsu event); wrong-sign-only frames must have none
  let sign = 0
  let wrongOnly = 0
  for (const f of frames) {
    const isSign = f.events.some((e) => e.type === 'step' || e.type === 'jutsu')
    if (isSign) sign += 1
    else if (f.events.some((e) => e.type === 'wrong_sign')) wrongOnly += 1
  }
  const wrongLoud = frames.filter(
    (f) => f.events.some((e) => e.type === 'wrong_sign') && !f.events.some((e) => e.type === 'step' || e.type === 'jutsu'),
  ).filter((f) => seals.some((s) => s.perf >= f.perf && s.perf - f.perf < 60)).length
  return { sign, wrongOnly, wrongLoud }
}

async function jutsuCase(jutsu, results, fixtureName = jutsu) {
  const browser = await launchEdge(fixtureName, { profile: `music-${fixtureName}` })
  await browser.addInitScript(PROBE)
  try {
    const { page } = await openPage(browser, '/live')
    await startAndWaitLive(page) // the click is the user gesture that allows audio
    const deadline = Date.now() + 80_000
    while (Date.now() < deadline) {
      await sleep(1000)
      const done = await page.evaluate(() => window.__musicLog.some((e) => e.kind === 'frame' && e.events.some((x) => x.type === 'effect_end')))
      if (done) break
    }
    await sleep(1200)
    const log = await page.evaluate(() => window.__musicLog)
    const { frames, tracks, seals, firstFrame } = analyse(log)
    const step1 = firstFrame((e) => e.type === 'step' && e.jutsu === jutsu)
    const fired = firstFrame((e) => e.type === 'jutsu' && e.jutsu === jutsu)
    const release = firstFrame((e) => e.type === 'effect_phase' && e.phase === 'release' && e.jutsu === jutsu)
    const before = tracks.filter((tr) => !fired || tr.perf < fired.perf)
    const mine = [...before].reverse().find((tr) => tr.jutsu === jutsu) ?? tracks.find((tr) => tr.jutsu === jutsu)
    const name = fixtureName
    console.log(`\n=== ${name}: ${frames.length} frames; tracks started: ${tracks.map((tr) => `${tr.jutsu}@${tr.perf}`).join(', ') || 'none'}`)
    if (process.env.MUSIC_DEBUG) {
      for (const f of frames) {
        const ev = f.events.filter((e) => e.type !== 'sign').map((e) => e.type + (e.phase ? ':' + e.phase : '') + (e.step !== undefined ? ':' + e.step : '') + (e.jutsu ? '/' + e.jutsu : ''))
        if (ev.length) console.log(`   frame @${f.perf}: ${ev.join(', ')} | ${JSON.stringify(f.progress)}`)
      }
      for (const tr of tracks) {
        console.log(`   track ${tr.jutsu}@${tr.perf}: gain ${tr.gainCalls.map((p) => `${p.m.replace('linearRampToValueAtTime', 'ramp').replace('setValueAtTime', 'set').replace('cancelAndHoldAtTime', 'hold')}(${p.args.map((a) => +(+a).toFixed(3)).join(',')})@${p.perf}`).join(' ')} | stops ${tr.stops.map((s) => `${s.when.toFixed(2)}@${s.perf}`).join(' ')}`)
      }
    }
    check(Boolean(step1), `${name}: the backend confirmed ${jutsu} step 1`, results)
    check(Boolean(mine), `${name}: ${jutsu}'s own track started`, results)
    // the step 1 that began the sequence this track plays for
    const ownStep1 = mine ? [...frames].reverse().find((f) => f.perf <= mine.perf + 0.5 && f.events.some((e) => e.type === 'step' && e.jutsu === jutsu && e.step === 1)) : null
    if (mine && ownStep1) {
      const delay = mine.perf - ownStep1.perf
      console.log(`   first step -> music start ${Math.round(delay)} ms`)
      check(delay >= 0 && delay < 2500, `${name}: it started after the first step (+${Math.round(delay)} ms)`, results)
    }
    // every track before the activation: started while its jutsu led, at the right ramp
    for (const [i, tr] of before.entries()) {
      const prev = [...frames].reverse().find((f) => f.perf <= tr.perf + 0.5)
      const top = prev ? Math.max(0, ...Object.values(prev.progress)) : 0
      const led = prev && (prev.progress[tr.jutsu] ?? 0) >= 1 && (prev.progress[tr.jutsu] ?? 0) === top
      const ramp = tr.gainCalls.find((p) => p.m === 'linearRampToValueAtTime' && Math.abs(p.args[0] - GAIN[tr.jutsu]) < 1e-6)
      const seconds = ramp ? ramp.args[1] - ramp.now : NaN
      // a crossfade only when the previous track was still playing (it fades from this start on)
      const prevTrack = before[i - 1]
      const prevFade = prevTrack?.gainCalls.find((p) => p.m === 'linearRampToValueAtTime' && p.args[0] === 0)
      const crossfade = Boolean(prevTrack) && (!prevFade || prevFade.perf >= tr.perf - 5)
      const want = crossfade ? 0.8 : 1.5
      console.log(`   track ${tr.jutsu}: progress then ${JSON.stringify(prev?.progress ?? {})}, ramp ${seconds.toFixed(2)} s`)
      check(led, `${name}: ${tr.jutsu}'s track started while it led (${JSON.stringify(prev?.progress ?? {})})`, results)
      check(Math.abs(seconds - want) < 0.05, `${name}: ${tr.jutsu} ${crossfade ? 'crossfaded in' : 'faded in'} over ${seconds.toFixed(2)} s`, results)
    }
    const playingAtFire = before.at(-1)
    check(!fired || playingAtFire?.jutsu === jutsu, `${name}: ${jutsu}'s own track was playing when the sequence completed (${playingAtFire?.jutsu ?? 'none'})`, results)
    if (mine && fired) {
      const duck = mine.duckCalls.find((p) => p.m === 'linearRampToValueAtTime' && Math.abs(p.args[0] - 0.25) < 1e-6 && p.perf >= fired.perf - 5)
      check(Boolean(duck) && duck.perf - fired.perf < 200, `${name}: ducked to 25 % at the confirmation (+${duck ? Math.round(duck.perf - fired.perf) : '?'} ms)`, results)
    }
    if (mine && release) {
      const fade = mine.gainCalls.find((p) => p.m === 'linearRampToValueAtTime' && p.args[0] === 0 && p.perf >= release.perf - 5)
      check(Boolean(fade) && Math.abs(fade.args[1] - fade.now - 1.5) < 0.05, `${name}: faded out over ${fade ? (fade.args[1] - fade.now).toFixed(2) : '?'} s at the release`, results)
      check(mine.stops.length > 0, `${name}: the track's source was stopped after its fade`, results)
    }
    const s = sealsPerSign(frames, seals)
    console.log(`   frames with a confirmed sign: ${s.sign}, hand seals: ${seals.length}, wrong-sign frames: ${s.wrongOnly}`)
    check(seals.length === s.sign, `${name}: one hand seal per confirmed sign (${seals.length} / ${s.sign})`, results)
    check(s.wrongLoud === 0, `${name}: no hand seal on a wrong sign`, results)
    return { page, browser, log }
  } finally {
    await browser.close()
  }
}

async function wrongKeep(results) {
  const browser = await launchEdge('../../seq-fixtures/live_wrong_keep', { profile: 'music-wrong-keep' })
  await browser.addInitScript(PROBE)
  try {
    const { page } = await openPage(browser, '/live')
    await startAndWaitLive(page)
    const deadline = Date.now() + 80_000
    while (Date.now() < deadline) {
      await sleep(1000)
      const done = await page.evaluate(() => window.__musicLog.some((e) => e.kind === 'frame' && e.events.some((x) => x.type === 'effect_phase' && x.phase === 'release')))
      if (done) break
    }
    await sleep(800)
    const log = await page.evaluate(() => window.__musicLog)
    const { frames, tracks, seals, firstFrame } = analyse(log)
    const wrong = firstFrame((e) => e.type === 'wrong_sign' && e.jutsu === 'fire_style')
    const release = firstFrame((e) => e.type === 'effect_phase' && e.phase === 'release')
    const fire = tracks.find((tr) => tr.jutsu === 'fire_style')
    console.log(`\n=== wrong_keep: wrong sign at ${wrong?.perf}, release at ${release?.perf}, tracks ${tracks.map((t) => t.jutsu).join(', ')}`)
    check(Boolean(wrong), 'wrong_keep: the backend reported the wrong sign (progress kept)', results)
    check(Boolean(fire), 'wrong_keep: Fire Style music was playing', results)
    if (fire && wrong) {
      const cut = fire.gainCalls.find((p) => p.m === 'linearRampToValueAtTime' && p.args[0] === 0 && p.perf >= wrong.perf && (!release || p.perf < release.perf - 5))
      check(!cut, 'wrong_keep: the music went on through the wrong sign (no fade before the release)', results)
      if (cut) {
        // what happened before the fade: events, and the longest gap between frames
        const fr = frames.filter((f) => f.perf >= wrong.perf - 200 && f.perf <= cut.perf + 50)
        let gap = 0
        for (let i = 1; i < fr.length; i++) gap = Math.max(gap, fr[i].perf - fr[i - 1].perf)
        console.log(`   fade at ${cut.perf.toFixed(0)}; longest frame gap before it ${gap.toFixed(0)} ms; events: ` +
          JSON.stringify(fr.flatMap((f) => f.events.map((e) => `${(f.perf - wrong.perf).toFixed(0)}ms ${e.type}${e.jutsu ? ':' + e.jutsu : ''}${e.step !== undefined ? ':' + e.step : ''}`))))
      }
    }
    const s = sealsPerSign(frames, seals)
    check(s.wrongOnly > 0 && s.wrongLoud === 0, `wrong_keep: no hand seal for the wrong sign (${s.wrongOnly} wrong-sign frames)`, results)
  } finally {
    await browser.close()
  }
}

async function cameraStop(results) {
  const browser = await launchEdge('rasengan', { profile: 'music-camera-stop' })
  await browser.addInitScript(PROBE)
  try {
    const { page } = await openPage(browser, '/live')
    await startAndWaitLive(page)
    let started = null
    const deadline = Date.now() + 60_000
    while (!started && Date.now() < deadline) {
      await sleep(500)
      const log = await page.evaluate(() => window.__musicLog)
      started = analyse(log).tracks[0] ?? null
    }
    check(Boolean(started), 'camera_stop: a track was playing', results)
    if (!started) return
    await sleep(1500)
    const clickAt = await page.evaluate(() => performance.now())
    await page.getByTestId('stop-camera').click()
    await sleep(4000)
    const log = await page.evaluate(() => window.__musicLog)
    const track = analyse(log).tracks.find((tr) => tr.node === started.node)
    const fade = track.gainCalls.find((p) => p.m === 'linearRampToValueAtTime' && p.args[0] === 0 && p.perf >= clickAt)
    console.log(`\n=== camera_stop: fade-out ${fade ? Math.round(fade.perf - clickAt) : '?'} ms after Stop camera`)
    check(Boolean(fade) && fade.perf - clickAt < 3000, `camera_stop: the music faded out after the camera stopped (+${fade ? Math.round(fade.perf - clickAt) : '?'} ms)`, results)
  } finally {
    await browser.close()
  }
}

const ALL = ['fire_style', 'chidori', 'shadow_clone', 'rasengan', 'wrong_keep', 'camera_stop']
const names = process.argv.slice(2).length ? process.argv.slice(2) : ALL
const results = []
for (const name of names) {
  try {
    if (name === 'wrong_keep') await wrongKeep(results)
    else if (name === 'camera_stop') await cameraStop(results)
    else await jutsuCase(name, results)
  } catch (e) {
    check(false, `${name}: crashed: ${e.message}`, results)
  }
}
summary(results)
