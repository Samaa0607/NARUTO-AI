// The sequence rules end to end, with the user's real recordings as the camera and the real backend:
//   practice_retry   Practice: 2 right signs, 3 wrong attempts at step 3, then the right one and the
//                    last one. The 2 steps stay done, every wrong attempt is a gentle warning
//                    (wrong_sign), never a reset, and the jutsu completes.
//   practice_wait    Practice: a 30+ s pause after step 2 changes nothing (no timer, no reset).
//   live_timeout     Live: a pause longer than the 7 s limit after step 2 resets (sequence_failed).
//   live_wrong_keep  Live: a wrong sign keeps the progress; the right one next completes Fire Style.
//   live_retry       Live: 2 right signs, 2 wrong attempts, the right third: the card stays at 2/4 on
//                    Fire Style with a warning, each wrong attempt gives the step its full 7 s again
//                    (the countdown goes back up, and only then), then it completes.
//   live_retry_slow  Live: wrong attempts after step 2 (dog, ram) that take more than 7 s in total but
//                    never 7 s without a new sign: no reset, the card stays at 2/4, then the right
//                    horse and tiger complete Fire Style.
//   live_tie         Live: Rasengan step 1, then a wrong sign that starts Fire Style: the card stays on
//                    Rasengan, the wrong attempt gives its step the full 7 s again (also when it starts
//                    another jutsu), and with nothing more it times out 7 s after that sign (+ notice).
//   live_repeat      Live: the last sign shown again does not restart the 7 s.
//   live_start_over  Live: "Start over" resets at once, and no timeout follows.
//
//   node e2e/sequence-rules.mjs [case ...]        (default: all; fixtures from make_fixtures.py)
import { check, launchEdge, openPage, shot, sleep, startAndWaitLive, summary } from './lib.mjs'

const CASES = {
  practice_retry: { route: '/practice/fire_style', run: practiceRetry },
  practice_wait: { route: '/practice/fire_style', run: practiceWait },
  live_timeout: { route: '/live', run: liveTimeout },
  live_wrong_keep: { route: '/live', run: liveWrongKeep },
  live_retry: { route: '/live', run: liveRetry },
  live_retry_slow: { route: '/live', run: liveRetrySlow },
  live_tie: { route: '/live', run: liveTie },
  live_repeat: { route: '/live', run: liveRepeat },
  live_start_over: { route: '/live', run: liveStartOver, fixture: 'live_timeout' },
}

const fire = (socket) => socket.events.filter((e) => e.jutsu === 'fire_style')
const of = (socket, id) => socket.events.filter((e) => e.jutsu === id)

/** what the Live sequence card shows right now */
const card = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('[data-testid="sequence-track"]')
    const left = document.querySelector('[data-testid="time-left"]')?.textContent ?? null
    return {
      jutsu: c?.getAttribute('data-jutsu') ?? null,
      count: document.querySelector('[data-testid="step-count"]')?.textContent?.replace(/\s+/g, '') ?? null,
      left: left === null ? null : parseFloat(left),
      warning: document.querySelector('[data-testid="sequence-warning"]')?.textContent ?? null,
      notice: document.querySelector('[data-testid="sequence-notice"]')?.textContent ?? null,
      ring: document.querySelectorAll('[data-testid="step-miss"]').length,
      reset: (() => {
        const b = document.querySelector('[data-testid="sequence-reset"]')
        return b ? !b.hidden : null
      })(),
    }
  })

/** a countdown series never goes back up (beyond rounding / frame jitter) */
function neverUp(values, slack = 0.15) {
  for (let i = 1; i < values.length; i++) if (values[i] > values[i - 1] + slack) return { ok: false, at: i, from: values[i - 1], to: values[i] }
  return { ok: true }
}

/** the backend's own clock for one jutsu (FrameState.time_left_per_jutsu) between two moments */
const clock = (socket, id, from, to) =>
  socket.progress.filter((p) => p.at >= from && p.at <= to && p.perJutsu && p.perJutsu[id] !== undefined).map((p) => p.perJutsu[id])

/** the Live time limit the server announced (hello.info.sequence_max_gap = config.SEQUENCE_MAX_GAP) */
const maxGapOf = (socket) => socket.texts.find((t) => t.type === 'hello')?.info?.sequence_max_gap ?? 7

/**
 * Live: a wrong attempt at the leader's next step gives that step its full time again. Pairs every
 * rise of a countdown series ([{ at, v }], beyond rounding / frame jitter) with the wrong attempt it
 * follows (from `lead` ms before it to `lag` ms after it, and before the next attempt): each attempt's
 * rise (or null), and every other rise (one attempt explains one rise; between attempts the countdown
 * may only go down).
 */
function pairRises(series, wrong, lead, lag, slack = 0.15) {
  const ups = []
  for (let i = 1; i < series.length; i++) if (series[i].v > series[i - 1].v + slack) ups.push({ at: series[i].at, from: series[i - 1].v, to: series[i].v })
  const inWindow = (r, i) => r.at >= wrong[i].at - lead && r.at <= wrong[i].at + lag && (i + 1 >= wrong.length || r.at < wrong[i + 1].at - lead)
  const per = wrong.map((ev, i) => ({ ev, rise: ups.find((r) => inWindow(r, i)) ?? null }))
  const used = new Set(per.map((p) => p.rise))
  return { per, stray: ups.filter((r) => !used.has(r)) }
}

/** the backend's Fire Style clock between two moments: back to the full time with every wrong attempt, else only down */
function checkClockRestarts(socket, wrong, from, to, maxGap, results) {
  const series = socket.progress
    .filter((p) => p.at > from && p.at < to && p.perJutsu && p.perJutsu.fire_style !== undefined)
    .map((p) => ({ at: p.at, v: p.perJutsu.fire_style }))
  // a frame's clock and its events come in the same FrameState: recorded a few ms apart at most
  const { per, stray } = pairRises(series, wrong, 50, 50)
  const ok = series.length > 0 && wrong.length > 0 && per.every((p) => p.rise && p.rise.to >= maxGap - 0.15) && stray.length === 0
  const seen = per.map((p) => `${p.ev.got}: ${p.rise ? `${p.rise.from.toFixed(2)} -> ${p.rise.to.toFixed(2)} s` : 'no restart'}`).join(', ')
  const extra = stray.length ? `; but it also rose ${stray.map((r) => `${r.from} -> ${r.to}`).join(', ')} without a wrong attempt` : ''
  check(ok, `the backend gave Fire Style its full ${maxGap} s again with each wrong attempt (${seen}), otherwise its clock only went down${extra}`, results)
}

/** the card's countdown (samples of card()): back up to about the full time after every wrong attempt, else only down */
function checkCardRestarts(samples, wrong, maxGap, results) {
  const series = samples.filter((x) => x.left !== null).map((x) => ({ at: x.at, v: x.left }))
  // a sample is stamped when page.evaluate returns: the restarted value can be read a moment after the
  // wrong attempt (more on a busy machine), already counted down by that much
  const { per, stray } = pairRises(series, wrong, 300, 4000)
  const after = (p) => Math.max(0, p.rise.at - p.ev.at) / 1000
  const ok = series.length > 0 && wrong.length > 0 && per.every((p) => p.rise && p.rise.to + after(p) >= maxGap - 0.5) && stray.length === 0
  const seen = per
    .map((p) => `${p.ev.got}: ${p.rise ? `${p.rise.from} -> ${p.rise.to} s, read ${after(p).toFixed(2)} s after it` : 'never'}`)
    .join('; ')
  const extra = stray.length ? `; but it also rose ${stray.map((r) => `${r.from} -> ${r.to}`).join(', ')} without a wrong attempt` : ''
  check(ok, `the countdown on the card went back up to the full ${maxGap} s after each wrong attempt (${seen}), otherwise it only counted down${extra}`, results)
}

/** fire_style progress over time never went down between two moments (ms timestamps) */
function neverBackwards(socket, from, to) {
  let best = 0
  for (const { at, progress } of socket.progress) {
    if (at < from || at > to) continue
    const n = progress.fire_style ?? 0
    if (n < best) return { ok: false, at, n, best }
    best = Math.max(best, n)
  }
  return { ok: true, best }
}

async function waitFor(page, socket, pred, timeout) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const hit = pred()
    if (hit) return hit
    await sleep(150)
  }
  return null
}

async function practiceRetry(page, socket, results) {
  let warned = false
  const fired = await waitFor(page, socket, () => {
    // the first wrong attempt AT STEP 3 (the AI may join the looping video mid-way and see a wrong
    // first sign before that: a correct warning at step 1, but not the case checked here)
    if (!warned && fire(socket).some((e) => e.type === 'wrong_sign' && e.step === 2)) {
      warned = true
      void (async () => {
        await sleep(400)
        const ui = await page.evaluate(() => ({
          kind: document.querySelector('[data-testid="practice-failure"]')?.getAttribute('data-kind'),
          text: document.querySelector('[data-testid="practice-failure"]')?.textContent ?? '',
          states: [...document.querySelectorAll('[data-testid="sequence-steps"] > li')].map((li) => li.dataset.state),
          ring: document.querySelectorAll('[data-testid="step-miss"]').length,
          countdown: document.querySelectorAll('[data-testid="countdown"]').length,
        }))
        console.log('UI at the first wrong attempt:', JSON.stringify(ui))
        check(ui.kind === 'wrong_sign' && /not recognized/.test(ui.text), `gentle warning shown: "${ui.text}"`, results)
        check(ui.states[0] === 'done' && ui.states[1] === 'done' && ui.states[2] === 'current', `steps 1-2 stay done, step 3 current (${ui.states})`, results)
        check(ui.ring === 1, 'the current tile shows the amber retry ring', results)
        check(ui.countdown === 0, 'no countdown in Practice', results)
        await page.locator('[data-testid="practice-session"]').screenshot({ path: shot('practice-retry-warning'), timeout: 180_000 })
      })()
    }
    return fire(socket).find((e) => e.type === 'jutsu')
  }, 150_000)
  const ev = fire(socket)
  console.log('fire_style events:', JSON.stringify(ev.map(({ at: _at, ...e }) => e)))
  const step2 = ev.find((e) => e.type === 'step' && e.step === 2)
  const step3 = ev.find((e) => e.type === 'step' && e.step === 3)
  const wrong = ev.filter((e) => e.type === 'wrong_sign' && e.step === 2 && e.expected === 'horse' && (!step3 || e.at < step3.at))
  check(Boolean(step2), 'step 2 (boar) confirmed', results)
  check(wrong.length >= 2, `${wrong.length} wrong attempts at step 3 reported as wrong_sign (expected horse; got ${wrong.map((e) => e.got)})`, results)
  check(!socket.events.some((e) => e.type === 'sequence_failed'), 'no sequence_failed (no reset, no timeout) in Practice', results)
  check(Boolean(step3) && Boolean(fired) && fired.at >= step3.at, 'step 3 (horse) after the retries, then Fire Style completed', results)
  if (step2 && fired) {
    const nb = neverBackwards(socket, step2.at, fired.at - 30)
    check(nb.ok, `progress never went backwards between step 2 and the completion${nb.ok ? '' : ` (${nb.best} -> ${nb.n})`}`, results)
  }
  await page.waitForSelector('[data-testid="practice-complete"]', { timeout: 20_000 }).catch(() => null)
  check((await page.getByTestId('practice-complete').count()) === 1, 'completion shown', results)
}

async function practiceWait(page, socket, results) {
  const step2 = await waitFor(page, socket, () => fire(socket).find((e) => e.type === 'step' && e.step === 2), 90_000)
  check(Boolean(step2), 'step 2 (boar) confirmed', results)
  if (!step2) return
  // the fixture now shows no hands for 32 s
  const samples = []
  for (let s = 0; s < 30; s++) {
    await sleep(1000)
    const ui = await page.evaluate(() => ({
      step: document.querySelector('[data-testid="practice-step"]')?.textContent?.trim(),
      countdown: document.querySelectorAll('[data-testid="countdown"]').length,
    }))
    samples.push({ t: s + 1, progress: socket.last?.progress?.fire_style ?? null, timeLeft: socket.last?.time_left ?? null, ...ui })
  }
  console.log('every 5 s of the 30 s pause:', JSON.stringify(samples.filter((x) => x.t % 5 === 0)))
  check(samples.every((x) => x.progress === 2), 'progress stayed at 2 for 30 s', results)
  check(samples.every((x) => x.step === 'Step 3 of 4'), 'the page stayed on "Step 3 of 4"', results)
  check(samples.every((x) => x.timeLeft === null && x.countdown === 0), 'no time limit sent and no countdown shown', results)
  check(!socket.events.some((e) => e.type === 'sequence_failed'), 'no sequence_failed during the pause', results)
  await page.locator('[data-testid="practice-session"]').screenshot({ path: shot('practice-after-30s'), timeout: 180_000 })
  const fired = await waitFor(page, socket, () => fire(socket).find((e) => e.type === 'jutsu'), 60_000)
  check(Boolean(fired), 'after the pause, horse + tiger completed Fire Style', results)
}

async function liveTimeout(page, socket, results) {
  const step2 = await waitFor(page, socket, () => fire(socket).find((e) => e.type === 'step' && e.step === 2), 90_000)
  check(Boolean(step2), 'step 2 (boar) confirmed', results)
  await sleep(1500)
  const shown = await page.evaluate(() => document.querySelector('[data-testid="time-left"]')?.textContent ?? null)
  check(Boolean(shown), `countdown shown on Live after step 2 ("${shown}")`, results)
  // the timeout of THIS run (the looping video may have timed out an earlier run at step 1 while the
  // AI was still warming up / stalled after the camera started)
  const early = fire(socket).filter((e) => e.type === 'sequence_failed' && step2 && e.at < step2.at).length
  if (early) console.log(`note: ${early} earlier run(s) timed out before this one (AI warm-up after the camera started)`)
  const failed = await waitFor(page, socket, () => fire(socket).find((e) => e.type === 'sequence_failed' && step2 && e.at > step2.at), 30_000)
  console.log('fire_style events:', JSON.stringify(fire(socket).map(({ at: _at, ...e }) => e)))
  check(failed?.reason === 'timeout' && failed?.step === 2 && failed?.expected === 'horse', `reset by timeout after step 2 (${JSON.stringify(failed && { reason: failed.reason, step: failed.step })})`, results)
  if (step2 && failed) {
    const gap = (failed.at - step2.at) / 1000
    check(gap > 6.5 && gap < 9.5, `the timeout came ${gap.toFixed(1)} s after the last confirmed step (limit 7 s)`, results)
  }
  check(!fire(socket).some((e) => e.type === 'jutsu' && (!failed || e.at < failed.at + 4000)), 'no Fire Style from the late signs', results)
  const toast = await page.locator('[data-testid="failure-toast"][data-reason="timeout"]').count()
  check(toast >= 1, 'the timeout notice was shown', results)
  await sleep(400)
  const c = await card(page)
  check(/Time ran out/.test(c.notice ?? ''), `the card explained the reset: "${c.notice ?? ''}"`, results)
}

async function liveWrongKeep(page, socket, results) {
  const fired = await waitFor(page, socket, () => fire(socket).find((e) => e.type === 'jutsu'), 120_000)
  const ev = fire(socket)
  console.log('fire_style events:', JSON.stringify(ev.map(({ at: _at, ...e }) => e)))
  const step2 = ev.find((e) => e.type === 'step' && e.step === 2)
  const wrong = ev.find((e) => e.type === 'wrong_sign' && e.step === 2 && e.expected === 'horse')
  const step3 = ev.find((e) => e.type === 'step' && e.step === 3)
  check(Boolean(wrong), `wrong sign at step 3 reported, progress kept (${wrong?.got})`, results)
  check(Boolean(step3) && Boolean(wrong) && step3.at > wrong.at, 'the right sign after it continued to step 3', results)
  check(Boolean(fired), 'Fire Style completed', results)
  check(!ev.some((e) => e.type === 'sequence_failed' && (!fired || e.at < fired.at)), 'no reset before the completion', results)
  if (step2 && fired) {
    const nb = neverBackwards(socket, step2.at, fired.at - 30)
    check(nb.ok, 'progress never went backwards between step 2 and the completion', results)
  }
}

async function liveRetry(page, socket, results) {
  const maxGap = maxGapOf(socket)
  const step2 = await waitFor(page, socket, () => fire(socket).find((e) => e.type === 'step' && e.step === 2), 90_000)
  check(Boolean(step2), 'step 2 (boar) confirmed', results)
  const samples = []
  let shot = false
  const fired = await waitFor(page, socket, () => {
    const done = fire(socket).find((e) => e.type === 'jutsu')
    if (!done && step2 && !fire(socket).some((e) => e.type === 'step' && e.step === 3)) {
      void card(page).then(async (c) => {
        samples.push({ at: Date.now(), ...c })
        if (!shot && c.warning) {
          shot = true
          await page.locator('[data-testid="sequence-track"]').screenshot({ path: shot_('live-retry-warning'), timeout: 60_000 }).catch(() => null)
        }
      })
    }
    return done
  }, 90_000)
  const ev = fire(socket)
  console.log('fire_style events:', JSON.stringify(ev.map(({ at: _at, ...e }) => e)))
  const step3 = ev.find((e) => e.type === 'step' && e.step === 3)
  // the run that reached step 3 (the looping video may have timed out an earlier run while the AI
  // was still warming up): its own step 2
  const run2 = step3 ? ev.filter((e) => e.type === 'step' && e.step === 2 && e.at < step3.at).pop() : null
  const early = ev.filter((e) => e.type === 'sequence_failed' && run2 && e.at < run2.at).length
  if (early) console.log(`note: ${early} earlier run(s) timed out before this one (AI warm-up after the camera started)`)
  const wrong = ev.filter((e) => e.type === 'wrong_sign' && e.step === 2 && run2 && e.at > run2.at && e.at < step3.at)
  // the video shows 2 wrong signs of 1.6 s; the AI may miss one of such short signs, the rule is
  // that none of those it confirms resets the run
  check(wrong.length >= 1, `${wrong.length} wrong attempt(s) at step 3 in the run (of 2 shown), none reset it (got ${wrong.map((e) => e.got)})`, results)
  if (run2 && step3) {
    const step2 = run2
    // up to (not including) the frame that carried step 3: the recorder stamps its progress and its
    // events with separate clock reads, so leave a small margin
    const end = step3.at - 30
    const between = socket.progress.filter((x) => x.at > step2.at && x.at < end).map((x) => x.progress.fire_style ?? 0)
    check(between.length > 0 && between.every((n) => n === 2), `progress stayed at 2/4 until the right third sign (${between.length} frames)`, results)
    checkClockRestarts(socket, wrong, step2.at, end, maxGap, results)
  }
  const inRun = samples.filter((x) => run2 && step3 && x.at > run2.at + 400 && x.at < step3.at)
  console.log(`card countdown during the wrong attempts: ${inRun.filter((x) => x.left !== null).map((x) => x.left).join(', ')}`)
  checkCardRestarts(inRun, wrong, maxGap, results)
  check(inRun.length > 0 && inRun.every((x) => x.jutsu === 'fire_style' && x.count === '2/4'), `the card stayed on Fire Style at 2/4 during the wrong attempts (${[...new Set(inRun.map((x) => `${x.jutsu} ${x.count}`))]})`, results)
  const warned = inRun.find((x) => x.warning)
  check(Boolean(warned) && /HORSE/.test(warned.warning) && warned.ring === 1, `the card warned which sign to make again: "${warned?.warning ?? ''}"`, results)
  check(samples.some((x) => x.reset === true), 'the "Start over" button was shown during the sequence', results)
  check(Boolean(fired) && Boolean(step3) && fired.at > step3.at, 'the right third sign, then the last one: Fire Style completed', results)
  check(!ev.some((e) => e.type === 'sequence_failed' && run2 && e.at > run2.at && (!fired || e.at < fired.at)), 'no reset during the run', results)
}

async function liveRetrySlow(page, socket, results) {
  const maxGap = maxGapOf(socket)
  const step2 = await waitFor(page, socket, () => fire(socket).find((e) => e.type === 'step' && e.step === 2), 90_000)
  check(Boolean(step2), 'step 2 (boar) confirmed', results)
  const samples = []
  let shotTaken = false
  const fired = await waitFor(page, socket, () => {
    const done = fire(socket).find((e) => e.type === 'jutsu')
    if (!done && step2 && !fire(socket).some((e) => e.type === 'step' && e.step === 3)) {
      void card(page).then(async (c) => {
        samples.push({ at: Date.now(), ...c })
        // evidence: the card after the second wrong attempt, more than 7 s after boar for most of it
        if (!shotTaken && /RAM/.test(c.warning ?? '')) {
          shotTaken = true
          await page.locator('[data-testid="sequence-track"]').screenshot({ path: shot('live-retry-slow-warning'), timeout: 60_000 }).catch(() => null)
        }
      })
    }
    return done
  }, 120_000)
  const ev = fire(socket)
  console.log('fire_style events:', JSON.stringify(ev.map(({ at: _at, ...e }) => e)))
  const step3 = ev.find((e) => e.type === 'step' && e.step === 3)
  // the run that reached step 3 (an earlier loop of the video may have run out of time while the AI
  // was still warming up): its own steps 1 and 2
  const run2 = step3 ? ev.filter((e) => e.type === 'step' && e.step === 2 && e.at < step3.at).pop() : null
  const run1 = run2 ? ev.filter((e) => e.type === 'step' && e.step === 1 && e.at < run2.at).pop() : null
  const early = socket.events.filter((e) => e.type === 'sequence_failed' && run1 && e.at < run1.at).length
  if (early) console.log(`note: ${early} earlier run(s) timed out before this one (AI warm-up after the camera started)`)
  const wrong = ev.filter((e) => e.type === 'wrong_sign' && e.step === 2 && run2 && e.at > run2.at && e.at < step3.at)
  const got = wrong.map((e) => e.got)
  check(
    got.includes('dog') && got.includes('ram') && wrong.every((e) => e.expected === 'horse'),
    `the wrong attempts at step 3 were reported for Fire Style with step 2 kept (expected horse, got ${got})`,
    results,
  )
  // no reset of any sequence from this run's first step to its completion (without a run reaching
  // step 3: from the first boar on, so a timeout there is caught)
  const from = run1?.at ?? step2?.at ?? 0
  const resets = socket.events.filter((e) => e.type === 'sequence_failed' && e.at > from && (!fired || e.at < fired.at))
  check(resets.length === 0, `no sequence_failed during the run (${resets.length}${resets.length ? `: ${resets.map((e) => `${e.jutsu} at step ${e.step}`)}` : ''})`, results)
  check(Boolean(fired) && Boolean(step3) && fired.at > step3.at, 'the right horse and tiger after the wrong attempts: Fire Style completed', results)
  if (run2 && step3) {
    const took = (step3.at - run2.at) / 1000
    check(took > maxGap, `boar step -> horse step took ${took.toFixed(1)} s, more than the ${maxGap} s limit`, results)
    const marks = [run2, ...wrong, step3]
    const gaps = marks.slice(1).map((e, i) => ({ label: `${marks[i].sign ?? marks[i].got} -> ${e.sign ?? e.got}`, s: (e.at - marks[i].at) / 1000 }))
    check(gaps.every((g) => g.s < maxGap), `but never ${maxGap} s without a new sign (${gaps.map((g) => `${g.label} ${g.s.toFixed(1)} s`).join(', ')})`, results)
    checkClockRestarts(socket, wrong, run2.at, step3.at - 30, maxGap, results)
  }
  const inRun = samples.filter((x) => run2 && step3 && x.at > run2.at + 400 && x.at < step3.at)
  console.log(`card countdown during the wrong attempts: ${inRun.filter((x) => x.left !== null).map((x) => x.left).join(', ')}`)
  check(
    inRun.length > 0 && inRun.every((x) => x.jutsu === 'fire_style' && x.count === '2/4'),
    `the card stayed on Fire Style at 2/4 during the wrong attempts (${inRun.length} samples: ${[...new Set(inRun.map((x) => `${x.jutsu} ${x.count}`))]})`,
    results,
  )
  const warned = inRun.find((x) => x.warning)
  check(Boolean(warned) && /HORSE/.test(warned.warning) && warned.ring === 1, `the card warned which sign to make again: "${warned?.warning ?? ''}"`, results)
  checkCardRestarts(inRun, wrong, maxGap, results)
}

async function liveTie(page, socket, results) {
  const r1 = await waitFor(page, socket, () => of(socket, 'rasengan').find((e) => e.type === 'step' && e.step === 1), 90_000)
  check(Boolean(r1), 'Rasengan step 1 (clone seal) confirmed', results)
  if (!r1) return
  const samples = []
  const failed = await waitFor(page, socket, () => {
    void card(page).then((c) => samples.push({ at: Date.now(), ...c }))
    return of(socket, 'rasengan').find((e) => e.type === 'sequence_failed')
  }, 30_000)
  await sleep(500)
  const after = await card(page)
  const fireStart = fire(socket).find((e) => e.type === 'step' && e.step === 1)
  const wrong = of(socket, 'rasengan').find((e) => e.type === 'wrong_sign')
  console.log('rasengan events:', JSON.stringify(of(socket, 'rasengan').map(({ at: _at, ...e }) => e)), '| fire step 1:', Boolean(fireStart))
  check(Boolean(wrong) && wrong.expected === 'dog', `the wrong sign was reported for Rasengan (expected dog, got ${wrong?.got})`, results)
  const during = samples.filter((x) => fireStart && x.at > fireStart.at + 300 && (!failed || x.at < failed.at))
  check(during.length > 0 && during.every((x) => x.jutsu === 'rasengan'), `the card stayed on Rasengan after the wrong sign started Fire Style (${[...new Set(during.map((x) => x.jutsu))]})`, results)
  const before = samples.filter((x) => x.jutsu === 'rasengan' && x.left !== null && wrong && x.at < wrong.at).map((x) => x.left)
  const afterWrong = samples.filter((x) => x.jutsu === 'rasengan' && x.left !== null && wrong && x.at > wrong.at + 100 && x.at < wrong.at + 1500).map((x) => x.left)
  check(before.length > 0 && afterWrong.length > 0 && Math.max(...afterWrong) > Math.min(...before) + 1,
    `Rasengan's countdown went back up after the wrong sign (${before.length ? Math.min(...before) : '-'} -> ${afterWrong.length ? Math.max(...afterWrong) : '-'} s)`, results)
  if (failed) {
    const gap = (failed.at - (wrong?.at ?? r1.at)) / 1000
    check(failed.reason === 'timeout' && gap > 6.5 && gap < 8.5, `Rasengan timed out ${gap.toFixed(1)} s after the wrong sign (7 s from the last attempt)`, results)
  } else check(false, 'Rasengan timed out', results)
  check(after.jutsu === 'rasengan' && /Time ran out/.test(after.notice ?? ''), `the card explained the reset: "${after.notice ?? ''}"`, results)
  await page.locator('[data-testid="sequence-track"]').screenshot({ path: shot_('live-timeout-notice'), timeout: 60_000 }).catch(() => null)
}

async function liveRepeat(page, socket, results) {
  const step2 = await waitFor(page, socket, () => fire(socket).find((e) => e.type === 'step' && e.step === 2), 90_000)
  check(Boolean(step2), 'step 2 (boar) confirmed', results)
  if (!step2) return
  const failed = await waitFor(page, socket, () => fire(socket).find((e) => e.type === 'sequence_failed'), 30_000)
  const repeats = socket.events.filter((e) => e.type === 'sign' && e.sign === 'boar' && e.at > step2.at + 500)
  console.log(`boar shown again ${repeats.length} time(s) after step 2`)
  check(repeats.length >= 1, 'boar was confirmed again after the pause (a repeat)', results)
  if (failed) {
    const gap = (failed.at - step2.at) / 1000
    check(gap > 6.5 && gap < 8.5, `the timeout came ${gap.toFixed(1)} s after the FIRST boar: the repeat did not restart the 7 s`, results)
    const nb = neverUp(clock(socket, 'fire_style', step2.at, failed.at))
    check(nb.ok, `the backend's clock never went back up${nb.ok ? '' : ` (${nb.from} -> ${nb.to})`}`, results)
  } else check(false, 'Fire Style timed out', results)
}

async function liveStartOver(page, socket, results) {
  const step2 = await waitFor(page, socket, () => fire(socket).find((e) => e.type === 'step' && e.step === 2), 90_000)
  check(Boolean(step2), 'step 2 (boar) confirmed', results)
  if (!step2) return
  await sleep(600)
  const before = await card(page)
  check(before.reset === true, '"Start over" is shown with a sequence in progress', results)
  const clicked = Date.now()
  await page.getByTestId('sequence-reset').click({ timeout: 10_000 })
  const zero = await waitFor(page, socket, () => socket.progress.find((x) => x.at > clicked && (x.progress.fire_style ?? 0) === 0), 5_000)
  check(Boolean(zero), `the backend reset the sequence ${zero ? `${((zero.at - clicked) / 1000).toFixed(2)} s` : 'never'} after the click`, results)
  await sleep(800)
  const after = await card(page)
  check(after.count === '0/4' && after.reset === false, `the card shows ${after.count} and hides the button`, results)
  await sleep(9000)
  check(!fire(socket).some((e) => e.type === 'sequence_failed' && e.at > clicked), 'no timeout followed (nothing was in progress any more)', results)
}

const shot_ = (name) => shot(name)
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CASES)
let failedCases = 0
for (const name of names) {
  const { route, run, fixture } = CASES[name]
  console.log(`\n=== ${name} (${route})`)
  const results = []
  const browser = await launchEdge(fixture ?? name, { profile: name })
  try {
    const { page, log, socket } = await openPage(browser, route)
    await startAndWaitLive(page)
    await run(page, socket, results)
    const errors = log.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'))
    check(errors.length === 0, `no console errors (${errors.length}${errors.length ? `: ${errors[0]}` : ''})`, results)
    const fps = socket.progress.map((x) => x.fps).filter((v) => typeof v === 'number' && v > 0).sort((a, b) => a - b)
    const firstReady = socket.progress.find((x) => x.ready === true)
    console.log(`   AI frame rate: median ${fps[Math.floor(fps.length / 2)]?.toFixed(1)} fps, lowest 10% ${fps[Math.floor(fps.length / 10)]?.toFixed(1)} fps; ready after ${firstReady ? socket.progress.indexOf(firstReady) : '?'} frames`)
    summary(results, { frames: socket.frames })
    if (results.some((r) => !r.ok)) failedCases += 1
  } catch (e) {
    console.log(`case ${name} crashed: ${e.message}`)
    failedCases += 1
  } finally {
    await browser.close()
  }
}
process.exitCode = failedCases ? 1 : 0
