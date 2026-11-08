import assert from 'node:assert/strict';
import { Simulator } from '../src/sim/engine';
import { CONFIG as C } from '../src/sim/config';
import { ASSET_IDS } from '../src/sim/assets';
import { AnomalyMonitor, IsolationForest, ML_PERSIST_S, cFactor, extractFeatures, trainModel } from '../src/sim/dashboardML';
import type { MlEvent } from '../src/sim/dashboardML';

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('  ok  ', name); };

/** step the sim and evaluate the monitor every 0.1 s, like the dashboard does */
function drive(s: Simulator, mon: AnomalyMonitor, sec: number, events: MlEvent[], scores: number[] = []) {
  for (let i = 0; i < Math.round(sec / C.tickS); i++) {
    s.step(C.tickS);
    if (i % 2 === 1) { events.push(...mon.update(extractFeatures(s), s.t)); scores.push(mon.status.score); }
  }
}

test('isolation forest basics: c(n) values, outliers score higher than inliers, deterministic', () => {
  assert.equal(cFactor(1), 0);
  assert.equal(cFactor(2), 1);
  assert.ok(Math.abs(cFactor(256) - 10.24) < 0.05);
  const r = (() => { let a = 3; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
  const data = Array.from({ length: 300 }, () => [r(), r(), r()]);
  const f1 = new IsolationForest(100, 128, 1).fit(data);
  const f2 = new IsolationForest(100, 128, 1).fit(data);
  // on uniform data an out-of-range point scores ~0.64, a central point ~0.45
  assert.ok(f1.score([5, 5, 5]) > 0.6);
  assert.ok(f1.score([0.5, 0.5, 0.5]) < 0.5);
  assert.ok(f1.score([5, 5, 5]) > f1.score([0.5, 0.5, 0.5]) + 0.12);
  assert.equal(f1.score([0.3, 0.7, 0.2]), f2.score([0.3, 0.7, 0.2]));
});

for (const id of ASSET_IDS) {
  const model = trainModel(id);

  test(`${id}: baseline runs stay below the anomaly threshold (no persistent flag in 60 s)`, () => {
    const s = new Simulator(41, id);
    const mon = new AnomalyMonitor(model);
    const ev: MlEvent[] = [], sc: number[] = [];
    drive(s, mon, 12, []); // warm-up: history buffer starts flat
    drive(s, mon, 60, ev, sc);
    assert.ok(!ev.some((e) => e.kind === 'flagged'), `flagged on baseline: ${ev.map((e) => e.text).join(' | ')}`);
    const frac = sc.filter((x) => x >= model.threshold).length / sc.length;
    assert.ok(frac < 0.05, `baseline above threshold ${Math.round(frac * 100)} % of the time`);
    console.log(`        threshold ${model.threshold.toFixed(3)}, baseline median ${sc.sort((a, b) => a - b)[sc.length >> 1].toFixed(3)}, ${model.baselineSamples} training windows`);
  });

  test(`${id}: a 300 ms knock spikes the score but is rejected by the persistence filter`, () => {
    const s = new Simulator(42, id);
    const mon = new AnomalyMonitor(model);
    const ev: MlEvent[] = [], sc: number[] = [];
    drive(s, mon, 12, []);
    s.preset('shock');
    drive(s, mon, 5, ev, sc);
    assert.ok(Math.max(...sc) >= model.threshold, `knock should spike the score (max ${Math.max(...sc).toFixed(2)})`);
    assert.ok(!ev.some((e) => e.kind === 'flagged'), 'knock must not become a persistent anomaly');
    assert.ok(ev.some((e) => e.kind === 'rejected'), 'rejection must be logged');
    assert.equal(s.state, 'NORMAL');
  });

  test(`${id}: the progressive fault becomes a persistent anomaly (held ≥ ${ML_PERSIST_S} s)`, () => {
    const s = new Simulator(43, id);
    const mon = new AnomalyMonitor(model);
    const ev: MlEvent[] = [];
    drive(s, mon, 12, []);
    s.preset('progressive');
    drive(s, mon, 14, ev);
    assert.ok(ev.some((e) => e.kind === 'flagged'), `no persistent anomaly; last score ${mon.status.score.toFixed(2)}`);
    assert.ok(mon.status.features.every(Number.isFinite));
  });
}

console.log(`\n${passed} ml tests passed`);
