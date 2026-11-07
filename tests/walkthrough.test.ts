import assert from 'node:assert/strict';
import { Simulator } from '../src/sim/engine';
import { CONFIG as C } from '../src/sim/config';
import { buildTimeline, SCENES, WALK_END_MS } from '../src/sim/walkthrough';

// drive the real timeline against the real engine, sampling state at the end of each scene
function playTour(startDirty: 'clean' | 'tripped') {
  const sim = new Simulator(31);
  for (let i = 0; i < 2 / C.tickS; i++) sim.step(C.tickS);
  if (startDirty === 'tripped') { sim.preset('critical'); for (let i = 0; i < 8 / C.tickS; i++) sim.step(C.tickS); }
  sim.drainLogs();
  const calls: string[] = [];
  let scene = 0;
  const steps = buildTimeline({ sim, focus: (n) => calls.push(`focus:${n}`), scrollTo: (id) => calls.push(`scroll:${id}`), setScene: (n) => { scene = n; calls.push(`scene:${n}`); } })
    .sort((a, b) => a.at - b.at);
  const log: Record<number, string> = {};
  let peakShock = 0, shockWindowState = '', k = 0;
  const sample = (ms: number, label: string) => { log[ms] = `${label}:${sim.getSnapshot().state}${sim.relayClosed ? '' : '(open)'}`; };
  for (let ms = 0; ms <= WALK_END_MS; ms += 50) {
    while (k < steps.length && steps[k].at <= ms) steps[k++].run();
    sim.step(C.tickS);
    const sn = sim.getSnapshot();
    if (ms >= 26500 && ms <= 31000) { peakShock = Math.max(peakShock, sn.vib); shockWindowState += sn.state[0]; }
    if (ms === 7950) sample(ms, 'end scene1');
    if (ms === 22950) sample(ms, 'end scene2');
    if (ms === 33950) sample(ms, 'end scene3');
    if (ms === WALK_END_MS) sample(ms, 'end scene4');
  }
  return { sim, calls, log, peakShock, shockWindowState, scene };
}

for (const mode of ['clean', 'tripped'] as const) {
  const r = playTour(mode);
  assert.equal(r.log[7950], 'end scene1:NORMAL', `scene 1 should end NORMAL (${mode}): ${r.log[7950]}`);
  assert.equal(r.log[22950], 'end scene2:EARLY', `scene 2 should reach EARLY (${mode}): ${r.log[22950]}`);
  assert.equal(r.log[33950], 'end scene3:NORMAL', `scene 3 should end NORMAL (${mode}): ${r.log[33950]}`);
  assert.equal(r.log[WALK_END_MS], 'end scene4:CRITICAL(open)', `scene 4 should end tripped (${mode}): ${r.log[WALK_END_MS]}`);
  assert.ok(r.peakShock > 5, `knock should visibly spike >5 mm/s (peak ${r.peakShock})`);
  assert.ok(!r.shockWindowState.includes('C'), `knock must not trip (${r.shockWindowState})`);
  assert.equal(r.scene, 4);
  assert.ok(r.calls.includes('scroll:sec-spectrum') && r.calls.includes('scroll:sec-terminal'));
  const logs = r.sim.getCapture().events.map((e) => e.text);
  assert.ok(logs.some((t) => t.startsWith('Transient vibration impulse rejected')), `FILTER line missing (${mode})`);
  assert.ok(logs.some((t) => t.includes('safety cut-off OPEN')), `trip line missing (${mode})`);
  console.log(`  ok   tour from ${mode} start: NORMAL → EARLY → knock rejected → CRITICAL (relay open)`);
}
assert.equal(SCENES.length, 4);
console.log('walkthrough timeline verified against the real engine');
