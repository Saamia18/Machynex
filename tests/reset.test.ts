import assert from 'node:assert/strict';
import { Simulator } from '../src/sim/engine';
import { CONFIG as C } from '../src/sim/config';

const run = (s: Simulator, sec: number) => { for (let i = 0; i < Math.round(sec / C.tickS); i++) s.step(C.tickS); };
let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('  ok  ', name); };

test('reset() mid-trip returns to the boot state: NORMAL, relay closed, setpoints nominal, clock 0', () => {
  const s = new Simulator(7);
  run(s, 3);
  s.preset('critical');
  run(s, 6);
  assert.equal(s.state, 'CRITICAL');
  assert.equal(s.relayClosed, false);
  s.reset();
  const snap = s.getSnapshot();
  assert.equal(snap.state, 'NORMAL');
  assert.equal(snap.relayClosed, true);
  assert.equal(s.t, 0);
  assert.equal(snap.sp.massG, C.massDefault);
  assert.equal(snap.sp.rpm, C.nominalRpm);
  assert.equal(snap.sp.currentA, C.currentNominal);
  assert.equal(snap.sp.tempC, C.tempNominal);
  assert.equal(snap.faultPresent, false);
  assert.equal(snap.leadTimeS, null);
  assert.equal(s.live.relayClosed, true);
  assert.equal(s.live.rpm, C.nominalRpm);
});

test('reset() clears ramps: a pending critical ramp does not continue after reset', () => {
  const s = new Simulator(7);
  s.preset('critical');
  run(s, 0.3);
  s.reset();
  run(s, 5);
  assert.equal(s.state, 'NORMAL');
  assert.equal(s.relayClosed, true);
  assert.ok(s.getSnapshot().vib < C.vib.warn);
});

test('reset() clears capture, events and logs (only the boot line remains)', () => {
  const s = new Simulator(7);
  s.preset('critical');
  run(s, 8);
  assert.ok(s.getCapture().packets.length > 0);
  s.reset();
  assert.equal(s.getCapture().packets.length, 0);
  assert.equal(s.drainEvents().length, 0);
  const logs = s.drainLogs();
  assert.equal(logs.length, 1);
  assert.match(logs[0].text, /Synthetic data only/);
});

test('reset() is deterministic: behaves exactly like a fresh simulator with the same seed', () => {
  const a = new Simulator(11);
  a.preset('progressive');
  run(a, 7);
  a.reset();
  const b = new Simulator(11);
  run(a, 5);
  run(b, 5);
  assert.deepEqual(a.getSnapshot(), b.getSnapshot());
  assert.deepEqual(a.history(), b.history());
});

test('reset() keeps the same live object (the 3D scene may hold a reference)', () => {
  const s = new Simulator(7);
  const live = s.live;
  s.preset('critical');
  run(s, 6);
  s.reset();
  assert.equal(s.live, live);
  assert.equal(live.state, 'NORMAL');
});

console.log(`\n${passed} reset tests passed`);
