import assert from 'node:assert/strict';
import {
  INSPECT_FADE, INSPECT_LIFT, SUITE_CODE, SUITE_ORDER, inspectFrame, inspectShot, isAcMachine, liveReading, stepSuite, suiteCard, suiteName,
} from '../src/sim/inspection';
import { inspectorEntry } from '../src/sim/hardwareSpecs';
import { NODE, RIGS } from '../src/sim/mounts';
import type { SensorKit } from '../src/sim/mounts';
import { ASSET_IDS } from '../src/sim/assets';

// Exploded component inspection: suite order, card honesty, live readings and macro framing.

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('  ok  ', name); };
const KITS: SensorKit[] = ['bench', 'industrial'];
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('suite order, codes and names', () => {
  assert.deepEqual(SUITE_ORDER, ['node', 'vibration', 'current', 'temperature']);
  assert.deepEqual(SUITE_ORDER.map((id) => SUITE_CODE[id]), ['NODE-01', 'VB-01', 'CT-01', 'TP-01']);
  assert.equal(suiteName('node', 'bench'), 'Edge Box');
  assert.equal(suiteName('vibration', 'bench'), 'Vibration Pod');
  assert.equal(suiteName('current', 'bench'), 'Current Sensor');
  assert.equal(suiteName('temperature', 'bench'), 'Thermal Probe');
  assert.equal(suiteName('current', 'industrial'), 'Current Clamp');
});

test('Prev / Next step through all four parts and wrap', () => {
  let id = SUITE_ORDER[0];
  const seen = [id];
  for (let i = 0; i < 3; i++) { id = stepSuite(id, 1); seen.push(id); }
  assert.deepEqual(seen, SUITE_ORDER);
  assert.equal(stepSuite('temperature', 1), 'node');
  assert.equal(stepSuite('node', -1), 'temperature');
});

test('lift and fade constants match the spec', () => {
  assert.equal(INSPECT_LIFT, 0.2);
  assert.equal(INSPECT_FADE, 0.16);
});

test('card bus / bandwidth come from hardwareSpecs (no new hardware figures)', () => {
  for (const kit of KITS) for (const id of SUITE_ORDER) {
    const c = suiteCard(id, kit, true);
    const e = inspectorEntry(id, kit);
    assert.equal(c.bus, e.protocol, `${id}/${kit}`);
    assert.equal(c.bandwidth, e.samplingRate, `${id}/${kit}`);
    assert.equal(c.concept, e.concept, `${id}/${kit}`);
    for (const k of ['measures', 'enclosure', 'ic', 'role'] as const) assert.ok(c[k].length > 8, `${id}/${kit} ${k}`);
    assert.ok(/\.$/.test(c.role), 'role is one sentence ending in a period');
  }
});

test('every industrial-kit card is tagged concept; packaging is never claimed as rated', () => {
  for (const id of SUITE_ORDER) assert.equal(suiteCard(id, 'industrial', true).concept, true, id);
  for (const kit of KITS) for (const id of SUITE_ORDER) {
    const c = suiteCard(id, kit, true);
    assert.ok(!/\bIP6\d\b(?!-style)/.test(c.enclosure), `${id}/${kit}: no bare IP rating`);
  }
  assert.match(suiteCard('node', 'bench', false).enclosure, /concept.*not rated or tested/);
  assert.match(suiteCard('node', 'bench', false).note ?? '', /concept add-on, not in the proposed bill of materials/);
});

test('honesty: no validation, accuracy, prediction or remaining-life wording', () => {
  const banned = /validated|accuracy|accurate|predict|remaining useful life|\bRUL\b|guarantee|certified|prevents failure/i;
  for (const kit of KITS) for (const ac of [true, false]) for (const id of SUITE_ORDER) {
    const c = suiteCard(id, kit, ac);
    for (const v of [c.measures, c.enclosure, c.ic, c.role, c.note ?? '']) assert.ok(!banned.test(v), `${id}/${kit}: "${v}"`);
  }
});

test('AC / DC guardrails: CT clamp and AC relay are flagged on the DC bench rig', () => {
  assert.equal(isAcMachine('bench-dc'), false);
  for (const a of ['induction-05hp', 'slurry-pump', 'helical-gearbox'] as const) assert.equal(isAcMachine(a), true);
  assert.match(suiteCard('current', 'industrial', false).note ?? '', /cannot measure this rig’s DC lead/);
  assert.match(suiteCard('current', 'industrial', true).role, /AC only/);
  assert.match(suiteCard('node', 'industrial', false).note ?? '', /DC-rated switch/);
  assert.match(suiteCard('node', 'industrial', true).note ?? '', /AC solid-state relay/);
  assert.match(suiteCard('current', 'bench', false).role, /^Optional channel/);
});

test('bench vibration card states the ~500 Hz bandwidth limit; unverified figures are flagged', () => {
  assert.match(suiteCard('vibration', 'bench', false).note ?? '', /500 Hz/);
  assert.ok(suiteCard('vibration', 'industrial', true).unverified.includes('Bandwidth'));
  assert.ok(suiteCard('current', 'industrial', true).unverified.includes('Rating'));
});

test('live readings format the simulated values', () => {
  const s = { state: 'EARLY', relayClosed: false, vib: 3.456, current: 1.234, temp: 51.27 };
  assert.deepEqual(liveReading('vibration', s), { label: 'Vibration velocity', value: '3.46', unit: 'mm/s RMS' });
  assert.deepEqual(liveReading('current', s), { label: 'Motor current', value: '1.23', unit: 'A' });
  assert.deepEqual(liveReading('temperature', s), { label: 'Temperature', value: '51.3', unit: '°C' });
  assert.deepEqual(liveReading('node', s), { label: 'Cut-off tripped', value: 'EARLY', unit: '' });
  assert.equal(liveReading('vibration', { ...s, vib: NaN }).value, '—');
});

test('macro framing: target sits on the lifted part, camera within orbit limits and above it', () => {
  for (const asset of ASSET_IDS) for (const kit of KITS) for (const id of SUITE_ORDER) {
    const f = inspectFrame(id, asset, kit);
    const d = dist(f.pos, f.target);
    assert.ok(d >= 0.95 && d <= 3, `${asset}/${kit}/${id}: distance ${d.toFixed(2)} (orbit min 0.9)`);
    assert.ok(f.pos[1] > f.target[1], `${asset}/${kit}/${id}: camera above the part`);
    assert.ok(f.pos[2] > f.target[2], `${asset}/${kit}/${id}: camera on the viewer side`);
    const polar = Math.acos((f.pos[1] - f.target[1]) / d);
    assert.ok(polar > 0.15 && polar < Math.PI * 0.49, `${asset}/${kit}/${id}: polar ${polar.toFixed(2)} inside orbit limits`);
  }
  const m = RIGS['slurry-pump'].mounts;
  const v = inspectFrame('vibration', 'slurry-pump', 'industrial').target;
  assert.ok(Math.abs(v[1] - (m.puck.pos[1] + INSPECT_LIFT + 0.2)) < 1e-9, 'puck target includes the lift');
  const n = inspectFrame('node', 'bench-dc', 'bench').target;
  assert.ok(Math.abs(n[1] - (NODE.center[1] + 0.12 + INSPECT_LIFT)) < 1e-9);
});

test('inspection shots carry the overlay width and a fresh id', () => {
  const a = inspectShot('current', 'bench-dc', 'bench');
  const b = inspectShot('current', 'bench-dc', 'bench');
  assert.equal(a.panelPx, 300);
  assert.notEqual(a.id, b.id);
  assert.equal(a.name, 'clamp');
});

console.log(`\ninspection: ${passed} tests passed`);
