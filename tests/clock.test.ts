import assert from 'node:assert/strict';
import { Simulator } from '../src/sim/engine';
import { CONFIG as C } from '../src/sim/config';
import { advanceRealTime, MAX_CATCH_UP_S } from '../src/sim/clock';

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('  ok  ', name); };

/** wall-clock seconds from the critical preset until the cut-off opens, rendering at a fixed frame time */
function tripTime(frameS: number): number {
  const s = new Simulator(5);
  advanceRealTime(s, 0); // no-op
  for (let i = 0; i < 40; i++) advanceRealTime(s, 0.05);
  s.preset('critical');
  let wall = 0;
  while (s.relayClosed && wall < 30) { advanceRealTime(s, frameS); wall += frameS; }
  return wall;
}

test('advanceRealTime hands the engine the full frame time in <= 0.1 s slices', () => {
  const calls: number[] = [];
  advanceRealTime({ step: (dt: number) => { calls.push(dt); } }, 0.67);
  assert.ok(calls.every((d) => d <= 0.1 + 1e-12));
  assert.ok(Math.abs(calls.reduce((a, b) => a + b, 0) - 0.67) < 1e-9);
});

test('a gap longer than the catch-up cap is dropped, not replayed', () => {
  let total = 0;
  advanceRealTime({ step: (dt: number) => { total += dt; } }, 12);
  assert.ok(Math.abs(total - MAX_CATCH_UP_S) < 1e-9);
  total = 0;
  advanceRealTime({ step: (dt: number) => { total += dt; } }, -1);
  assert.equal(total, 0);
});

test('trip time is the same at 60 fps and at 1.5 fps (software GL)', () => {
  const fast = tripTime(1 / 60);
  const slow = tripTime(1 / 1.5);
  const reference = tripTime(C.tickS);
  assert.ok(Math.abs(fast - reference) < 0.1, `60 fps ${fast.toFixed(2)} s vs reference ${reference.toFixed(2)} s`);
  // a slow frame can only be detected at its end, so allow one frame of quantisation
  assert.ok(slow - reference < 1 / 1.5 + 0.05 && slow >= reference - 0.05, `1.5 fps ${slow.toFixed(2)} s vs reference ${reference.toFixed(2)} s`);
  console.log(`        trip after ${reference.toFixed(2)} s (tick), ${fast.toFixed(2)} s (60 fps), ${slow.toFixed(2)} s (1.5 fps)`);
});

console.log(`\n${passed} clock tests passed`);
