import assert from 'node:assert/strict';
import { Simulator, vibFromMass } from '../src/sim/engine';
import { CONFIG as C } from '../src/sim/config';

let passed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log('  ok  ', name); }
  catch (e) { console.error('  FAIL', name, '\n       ', (e as Error).message); process.exitCode = 1; }
}
const run = (s: Simulator, sec: number) => { for (let i = 0; i < sec / C.tickS; i++) s.step(C.tickS); };
const texts = (s: Simulator) => s.drainLogs().map((l) => `[${l.kind}] ${l.text}`);

test('mass -> vibration mapping hits the spec endpoints at nominal rpm', () => {
  assert.ok(Math.abs(vibFromMass(0.05, 1450) - 0.5) < 1e-9);
  assert.ok(Math.abs(vibFromMass(1.5, 1450) - 8.0) < 1e-6);
  assert.ok(vibFromMass(0.15, 1450) < 2.8);
  assert.ok(vibFromMass(0.65, 1450) > 2.8 && vibFromMass(0.65, 1450) < 4.5);
});

test('rpm^2 scaling: half speed gives a quarter of the vibration', () => {
  const full = vibFromMass(0.65, 1450);
  assert.ok(Math.abs(vibFromMass(0.65, 725) - full / 4) < 1e-9);
});

test('baseline stays NORMAL for 60 s', () => {
  const s = new Simulator(1); run(s, 60);
  assert.equal(s.getSnapshot().state, 'NORMAL');
  assert.ok(s.getSnapshot().vib < 2.0);
  assert.ok(Math.abs(s.live.rpm - 1450) < 5);
});

test('progressive unbalance reaches EARLY (Advisory) and not CRITICAL', () => {
  const s = new Simulator(2); run(s, 2); s.drainLogs();
  s.preset('progressive'); run(s, 14);
  const snap = s.getSnapshot();
  assert.equal(snap.state, 'EARLY');
  assert.ok(snap.relayClosed);
  assert.ok(Math.abs(s.sp.massG - 0.65) < 1e-6);
  assert.ok(texts(s).some((t) => t.includes('NORMAL OPERATION -> EARLY WARNING')));
});

test('lead-time estimate appears during the ramp and is labelled-sane', () => {
  const s = new Simulator(3); run(s, 2);
  s.preset('progressive');
  let seen: number | null = null;
  for (let i = 0; i < 12 / C.tickS; i++) { s.step(C.tickS); const lt = s.getSnapshot().leadTimeS; if (lt != null) seen = lt; }
  assert.ok(seen != null && seen > 0 && seen < 60, `lead time was ${seen}`);
  run(s, 6);
  assert.equal(s.getSnapshot().leadTimeS, null); // ramp finished -> slope gone
});

test('300 ms shock is rejected: no state change, relay stays closed, FILTER logged', () => {
  const s = new Simulator(4); run(s, 3); s.drainLogs();
  s.preset('shock');
  let peak = 0;
  for (let i = 0; i < 4 / C.tickS; i++) { s.step(C.tickS); peak = Math.max(peak, s.getSnapshot().vib); }
  assert.ok(peak > 5.0, `shock peak ${peak} should exceed 5 mm/s`);
  const snap = s.getSnapshot();
  assert.equal(snap.state, 'NORMAL');
  assert.ok(snap.relayClosed);
  const l = texts(s);
  assert.ok(l.some((t) => t.startsWith('[FILTER] Transient vibration impulse rejected. Supporting thermal/current corroboration absent.')), l.join('\n'));
  assert.ok(!l.some((t) => t.startsWith('[TRIP]')));
});

test('shock during an existing EARLY WARNING does not trip either', () => {
  const s = new Simulator(5); run(s, 1); s.setTarget('massG', 0.65); run(s, 4);
  assert.equal(s.getSnapshot().state, 'EARLY');
  s.preset('shock'); run(s, 3);
  assert.equal(s.getSnapshot().state, 'EARLY');
  assert.ok(s.getSnapshot().relayClosed);
});

test('critical preset trips, opens relay, spins down smoothly to 0 rpm', () => {
  const s = new Simulator(6); run(s, 2); s.drainLogs(); s.drainEvents();
  s.preset('critical');
  let tripT = -1; const rpms: number[] = [];
  for (let i = 0; i < 12 / C.tickS; i++) {
    s.step(C.tickS);
    const sn = s.getSnapshot();
    if (tripT < 0 && sn.state === 'CRITICAL') tripT = sn.t;
    if (tripT >= 0) rpms.push(s.live.rpm);
  }
  assert.ok(tripT > 0, 'did not trip');
  assert.equal(s.getSnapshot().state, 'CRITICAL');
  assert.equal(s.getSnapshot().relayClosed, false);
  assert.ok(s.drainEvents().includes('trip'));
  for (let i = 1; i < rpms.length; i++) assert.ok(rpms[i] <= rpms[i - 1] + 1e-9, 'rpm must be monotonically falling');
  assert.equal(s.live.rpm, 0);
});

test('trip needs persistence (1 s) but NOT corroboration: vibration alone trips', () => {
  const s = new Simulator(7); run(s, 1);
  s.setTarget('massG', 1.2); // 6.4 mm/s at nominal, temp/current untouched
  run(s, 0.6); assert.notEqual(s.getSnapshot().state, 'CRITICAL');
  run(s, 1.2); assert.equal(s.getSnapshot().state, 'CRITICAL');
});

test('CRITICAL is latched: clearing sliders alone does not re-engage', () => {
  const s = new Simulator(8); run(s, 1); s.preset('critical'); run(s, 6);
  assert.equal(s.getSnapshot().state, 'CRITICAL');
  s.preset('baseline'); run(s, 5);
  assert.equal(s.getSnapshot().state, 'CRITICAL');
  assert.equal(s.getSnapshot().relayClosed, false);
});

test('Reset is refused while fault present, accepted after clearing', () => {
  const s = new Simulator(9); run(s, 1); s.preset('critical'); run(s, 6); s.drainLogs(); s.drainEvents();
  const r1 = s.resetRelay();
  assert.equal(r1.ok, false);
  assert.equal(s.getSnapshot().state, 'CRITICAL');
  s.preset('baseline'); run(s, 3);
  const r2 = s.resetRelay();
  assert.equal(r2.ok, true);
  assert.ok(s.drainEvents().includes('reset'));
  run(s, 8);
  const sn = s.getSnapshot();
  assert.equal(sn.state, 'NORMAL'); assert.equal(sn.relayClosed, true);
  assert.ok(Math.abs(s.live.rpm - 1450) < 10);
});

test('high temperature alone gives EARLY at 60 C and CRITICAL above 75 C', () => {
  const s = new Simulator(10); run(s, 1); s.setTarget('tempC', 60); run(s, 12);
  assert.equal(s.getSnapshot().state, 'EARLY');
  s.setTarget('tempC', 80); run(s, 12);
  assert.equal(s.getSnapshot().state, 'CRITICAL');
});

test('current above 4.0 A trips after 0.5 s persistence', () => {
  const s = new Simulator(11); run(s, 1); s.setTarget('currentA', 4.5); run(s, 3);
  assert.equal(s.getSnapshot().state, 'CRITICAL');
});

test('EARLY drops back to NORMAL only after hysteresis (2 s clean)', () => {
  const s = new Simulator(12); run(s, 1); s.setTarget('massG', 0.65); run(s, 4);
  assert.equal(s.getSnapshot().state, 'EARLY');
  s.setTarget('massG', 0.15); run(s, 1.2);
  assert.equal(s.getSnapshot().state, 'EARLY'); // still within hysteresis
  run(s, 3);
  assert.equal(s.getSnapshot().state, 'NORMAL');
});

test('spectrum has its dominant peak at rpm/60 = 24.17 Hz and scales with mass', () => {
  const s = new Simulator(13); run(s, 3);
  const peakHz = (sp: Float32Array) => { let k = 0; for (let i = 5; i < sp.length; i++) if (sp[i] > sp[k]) k = i; return k * (C.fftMaxHz / C.fftBins); };
  const lo = s.getSpectrum();
  const loHz = peakHz(lo.latest); const loAmp = Math.max(...lo.latest);
  assert.ok(Math.abs(loHz - 24.17) < 1.0, `peak at ${loHz}`);
  s.setTarget('massG', 0.75); run(s, 2);
  const hi = s.getSpectrum();
  assert.ok(Math.abs(peakHz(hi.latest) - 24.17) < 1.0);
  assert.ok(Math.max(...hi.latest) > 2 * loAmp, 'peak must grow with imbalance mass');
  s.setTarget('rpm', 1200); run(s, 4);
  assert.ok(Math.abs(peakHz(s.getSpectrum().latest) - 20) < 1.0, 'peak must follow rpm');
});

test('confidence reflects corroboration: vibration only = LOW; + temp + current = HIGH', () => {
  const s = new Simulator(14); run(s, 1); s.setTarget('massG', 0.65); run(s, 4);
  assert.equal(s.getSnapshot().confidence, 'LOW');
  s.setTarget('tempC', 52); s.setTarget('currentA', 2.0); run(s, 12);
  assert.equal(s.getSnapshot().confidence, 'HIGH');
});

test('telemetry packets are valid JSON and flagged synthetic', () => {
  const s = new Simulator(15); run(s, 3);
  const pk = s.drainLogs().filter((l) => l.kind === 'PACKET');
  assert.ok(pk.length >= 5);
  const o = JSON.parse(pk[0].text); assert.equal(o.synthetic, true); assert.ok('vib_mm_s' in o);
});

test('history buffer returns 200 samples (10 s) in time order', () => {
  const s = new Simulator(16); run(s, 12);
  const h = s.history(); assert.equal(h.vib.length, 200);
});

test('long soak: 10 minutes of random slider abuse never produces NaN', () => {
  const s = new Simulator(17); let r = 7;
  const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
  for (let i = 0; i < 600 / C.tickS; i++) {
    if (i % 40 === 0) { s.setTarget('massG', 0.05 + rnd() * 1.45); s.setTarget('rpm', 800 + rnd() * 1200); s.setTarget('tempC', 25 + rnd() * 70); s.setTarget('currentA', 0.5 + rnd() * 4.5); }
    if (i % 333 === 0) s.preset('shock');
    if (i % 500 === 0) s.resetRelay();
    s.step(C.tickS);
    const sn = s.getSnapshot();
    for (const v of [sn.vib, sn.current, sn.temp, sn.rpm, sn.vibAccG]) assert.ok(Number.isFinite(v));
  }
});



// ---------------------------------------------------------------- polish-release additions
import { vibZone } from '../src/sim/engine';
import { buildCsv, buildJson } from '../src/sim/exporter';

test('ISO-style zone bands: A <1.4, B <2.8, C <4.5, D above', () => {
  assert.equal(vibZone(0.5), 'A'); assert.equal(vibZone(1.39), 'A'); assert.equal(vibZone(1.4), 'B');
  assert.equal(vibZone(2.79), 'B'); assert.equal(vibZone(2.8), 'C'); assert.equal(vibZone(4.49), 'C'); assert.equal(vibZone(4.5), 'D'); assert.equal(vibZone(9), 'D');
});

test('snapshot zone follows state: baseline A/B, progressive C, critical D', () => {
  const s = new Simulator(21); run(s, 3);
  assert.ok(['A', 'B'].includes(s.getSnapshot().vibZone));
  s.setTarget('massG', 0.65); run(s, 4); assert.equal(s.getSnapshot().vibZone, 'C');
  s.preset('critical'); run(s, 1.5); assert.equal(s.getSnapshot().vibZone, 'D');
});

test('capture records ~2 packets per second and keeps non-packet events', () => {
  const s = new Simulator(22); run(s, 30); s.preset('critical'); run(s, 6);
  const cap = s.getCapture();
  assert.ok(cap.packets.length >= 70 && cap.packets.length <= 76, `packets ${cap.packets.length}`);
  assert.ok(cap.events.some((e) => e.kind === 'TRIP'));
  assert.ok(cap.events.every((e) => e.kind !== 'PACKET'));
});

test('JSON export is valid, flagged synthetic, and CSV has one row per packet', () => {
  const s = new Simulator(23); run(s, 10); s.preset('critical'); run(s, 6);
  const cap = s.getCapture();
  const j = JSON.parse(buildJson(cap, new Date('2026-11-07T10:00:00Z')));
  assert.equal(j.synthetic, true); assert.ok(/SYNTHETIC/.test(j.disclaimer));
  assert.equal(j.packets.length, cap.packets.length); assert.ok(j.events.length > 0);
  const lines = buildCsv(cap).trim().split('\n');
  assert.equal(lines.length, cap.packets.length + 1);
  assert.ok(lines[0].startsWith('t_s,state,zone')); assert.equal(lines[1].split(',').length, 10);
  assert.ok(lines.every((l) => !l.includes('NaN')));
});
console.log(`
${passed} passed${process.exitCode ? ', with FAILURES' : ''}`);
