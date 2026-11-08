// Phase 3 additions: the same walkthrough timeline on every asset, the hardware camera script, and asset-aware exports.
// (tests/walkthrough.test.ts is left untouched and still covers the bench rig.)
import assert from 'node:assert/strict';
import { Simulator } from '../src/sim/engine';
import { CONFIG as C } from '../src/sim/config';
import { ASSET_IDS, CONCEPT_ASSET_TAG } from '../src/sim/assets';
import type { AssetId } from '../src/sim/assets';
import { buildTimeline, scenesFor, WALK_END_MS } from '../src/sim/walkthrough';
import { buildCsv, buildJson } from '../src/sim/exporter';

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('  ok  ', name); };

function playTour(asset: AssetId) {
  const sim = new Simulator(31, asset);
  for (let i = 0; i < 2 / C.tickS; i++) sim.step(C.tickS);
  sim.drainLogs();
  const calls: string[] = [];
  const steps = buildTimeline({
    sim, focus: (n) => calls.push(`focus:${n}`), scrollTo: (id) => calls.push(`scroll:${id}`),
    setScene: (n) => calls.push(`scene:${n}`), setXray: (on) => calls.push(`xray:${on}`),
  }).sort((a, b) => a.at - b.at);
  const log: Record<number, string> = {};
  let shockWindow = '', k = 0;
  for (let ms = 0; ms <= WALK_END_MS; ms += 50) {
    while (k < steps.length && steps[k].at <= ms) steps[k++].run();
    sim.step(C.tickS);
    if (ms >= 26500 && ms <= 31000) shockWindow += sim.state[0];
    if ([7950, 22950, 33950, WALK_END_MS].includes(ms)) log[ms] = `${sim.state}${sim.relayClosed ? '' : '(open)'}`;
  }
  return { sim, calls, log, shockWindow };
}

for (const id of ASSET_IDS) {
  test(`${id}: walkthrough reaches NORMAL → EARLY → knock rejected → CRITICAL (open)`, () => {
    const r = playTour(id);
    assert.equal(r.log[7950], 'NORMAL');
    assert.equal(r.log[22950], 'EARLY', `scene 2 should reach EARLY on ${id}`);
    assert.equal(r.log[33950], 'NORMAL');
    assert.equal(r.log[WALK_END_MS], 'CRITICAL(open)');
    assert.ok(!r.shockWindow.includes('C'), 'knock must not trip');
    const logs = r.sim.drainLogs().map((l) => l.text);
    assert.ok(logs.some((t) => t.startsWith('Transient vibration impulse rejected')));
  });
}

test('camera script: node close-up with X-ray for 4 s, full rig, vibration pod, full rig, node at the trip', () => {
  const r = playTour('bench-dc');
  const seq = r.calls.filter((c) => c.startsWith('focus:') || c.startsWith('xray:'));
  assert.deepEqual(seq.slice(0, 4), ['focus:nodeMacro', 'xray:true', 'xray:false', 'focus:rig']);
  assert.ok(seq.includes('focus:puck'));
  assert.equal(seq[seq.length - 1], 'focus:nodeMacro');
  assert.equal(seq.filter((c) => c === 'xray:true').length, 1);
});

test('captions are asset-aware and concept assets carry the concept tag', () => {
  const pump = scenesFor(new Simulator(1, 'slurry-pump').profile);
  assert.equal(pump.length, 4);
  assert.match(pump[1].title, /cavitation/i);
  assert.ok(pump[0].caption.includes(CONCEPT_ASSET_TAG));
  assert.match(scenesFor(new Simulator(1, 'helical-gearbox').profile)[1].caption, /assumed/);
});

test('exports carry asset_id, asset_scope and the fault name; concept assets are tagged; still synthetic', () => {
  for (const id of ASSET_IDS) {
    const s = new Simulator(5, id);
    for (let i = 0; i < 6 / C.tickS; i++) s.step(C.tickS);
    const cap = s.getCapture();
    const j = JSON.parse(buildJson(cap));
    assert.equal(j.synthetic, true);
    assert.equal(j.asset.asset_id, id);
    assert.equal(j.asset.asset_scope, id === 'bench-dc' ? 'proposal' : 'concept');
    assert.ok(j.asset.fault.length > 0);
    assert.equal(j.asset.concept_tag, id === 'bench-dc' ? null : CONCEPT_ASSET_TAG);
    const lines = buildCsv(cap, { includeAsset: true }).trim().split('\n');
    assert.ok(lines[0].endsWith(',asset_id,asset_scope,fault_severity'));
    const row = lines[1].split(',');
    assert.equal(row.length, 13);
    assert.equal(row[10], id);
    assert.equal(buildCsv(cap).trim().split('\n')[1].split(',').length, 10, 'default CSV keeps the original 10 columns');
  }
});

console.log(`\n${passed} walkthrough/export asset tests passed`);
