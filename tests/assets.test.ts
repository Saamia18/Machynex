import assert from 'node:assert/strict';
import { Simulator, vibFromMass } from '../src/sim/engine';
import { CONFIG as C } from '../src/sim/config';
import { ASSETS, ASSET_IDS, gmfHz } from '../src/sim/assets';
import type { AssetId } from '../src/sim/assets';

const run = (s: Simulator, sec: number) => { for (let i = 0; i < Math.round(sec / C.tickS); i++) s.step(C.tickS); };
let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('  ok  ', name); };
const peakHz = (s: Simulator, from = 3) => {
  const { latest, maxHz } = s.getSpectrum();
  let k = from;
  for (let i = from; i < latest.length; i++) if (latest[i] > latest[k]) k = i;
  return (k * maxHz) / latest.length;
};
const binOf = (s: Simulator, f: number) => Math.round((f / s.getSpectrum().maxHz) * C.fftBins);

test('bench profile reproduces vibFromMass on a (mass, rpm) grid', () => {
  const P = ASSETS['bench-dc'];
  for (let m = 0.05; m <= 1.5; m += 0.05) for (let r = 800; r <= 2000; r += 100) {
    assert.equal(P.vib({ massG: m, severity: 0 }, r), vibFromMass(m, r));
  }
  const s = new Simulator();
  assert.equal(s.profile.id, 'bench-dc');
  assert.equal(s.getSnapshot().asset, 'bench-dc');
});

test('bench thresholds and nominals equal the original CONFIG values', () => {
  const P = ASSETS['bench-dc'];
  assert.deepEqual([P.nominal.rpm, P.nominal.current, P.nominal.temp], [C.nominalRpm, C.currentNominal, C.tempNominal]);
  assert.deepEqual([P.th.vibWarn, P.th.vibCrit, P.th.tempWarn, P.th.tempCrit, P.th.curCrit], [C.vib.warn, C.vib.crit, C.temp.warn, C.temp.crit, C.current.crit]);
  assert.equal(P.scope, 'proposal');
  for (const id of ASSET_IDS.filter((i) => i !== 'bench-dc')) assert.equal(ASSETS[id].scope, 'concept', id);
});

for (const id of ASSET_IDS) {
  const P = ASSETS[id];
  test(`${id}: baseline stays NORMAL for 60 s at ${P.nominal.rpm} rpm`, () => {
    const s = new Simulator(21, id);
    for (let i = 0; i < 60 / C.tickS; i++) { s.step(C.tickS); assert.equal(s.state, 'NORMAL', `left NORMAL at ${s.t.toFixed(2)} s`); }
    assert.ok(Math.abs(s.live.rpm - P.nominal.rpm) < 5);
  });

  test(`${id}: fault ramp reaches EARLY (not CRITICAL); critical preset trips; reset after clearing works`, () => {
    const s = new Simulator(22, id);
    run(s, 2);
    s.preset('progressive'); run(s, 12);
    assert.equal(s.state, 'EARLY', `progressive should end EARLY, got ${s.state} (vib ${s.getSnapshot().vib.toFixed(2)})`);
    s.preset('critical'); run(s, 6);
    assert.equal(s.state, 'CRITICAL');
    assert.equal(s.relayClosed, false);
    assert.equal(s.resetRelay().ok, false, 'reset must be refused while the fault is present');
    s.preset('baseline'); run(s, 2);
    assert.equal(s.resetRelay().ok, true);
    run(s, 8);
    assert.equal(s.state, 'NORMAL');
    assert.ok(Math.abs(s.live.rpm - P.nominal.rpm) < 15);
  });

  test(`${id}: 300 ms knock is rejected and logged, no state change`, () => {
    const s = new Simulator(23, id);
    run(s, 3); s.drainLogs();
    s.preset('shock'); run(s, 3);
    assert.equal(s.state, 'NORMAL');
    assert.ok(s.relayClosed);
    assert.ok(s.drainLogs().some((l) => l.text.startsWith('Transient vibration impulse rejected')));
  });

  test(`${id}: trip spins the shaft down to 0 rpm in 2.5 ± 0.3 s`, () => {
    const s = new Simulator(24, id);
    run(s, 3);
    s.preset('critical');
    let tripT = -1, stopT = -1;
    for (let i = 0; i < 15 / C.tickS && stopT < 0; i++) {
      s.step(C.tickS);
      if (tripT < 0 && !s.relayClosed) tripT = s.t;
      if (tripT >= 0 && s.live.rpm === 0) stopT = s.t;
    }
    assert.ok(tripT > 0 && stopT > 0, 'did not trip or stop');
    const d = stopT - tripT;
    assert.ok(Math.abs(d - 2.5) <= 0.3, `spin-down took ${d.toFixed(2)} s`);
  });

  test(`${id}: 10-minute random soak never produces NaN`, () => {
    const s = new Simulator(25, id);
    let x = 7;
    const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
    const L = P.limits;
    for (let i = 0; i < 600 / C.tickS; i++) {
      if (i % 40 === 0) {
        s.setTarget('massG', 0.05 + rnd() * 1.45); s.setTarget('severity', rnd());
        s.setTarget('rpm', L.rpm[0] + rnd() * (L.rpm[1] - L.rpm[0])); s.setTarget('tempC', L.temp[0] + rnd() * (L.temp[1] - L.temp[0]));
        s.setTarget('currentA', L.current[0] + rnd() * (L.current[1] - L.current[0]));
      }
      if (i % 300 === 0) s.preset(['baseline', 'progressive', 'shock', 'critical'][Math.floor(rnd() * 4)] as 'baseline');
      if (i % 500 === 0) s.resetRelay();
      s.step(C.tickS);
      const sn = s.getSnapshot();
      for (const v of [sn.vib, sn.current, sn.temp, sn.rpm, sn.vibAccG]) assert.ok(Number.isFinite(v));
      if (i % 200 === 0) assert.ok(s.getSpectrum().latest.every(Number.isFinite));
    }
  });
}

test('pump: dominant peak at rpm/60 = 48.33 Hz at low severity', () => {
  const s = new Simulator(30, 'slurry-pump');
  run(s, 3);
  assert.ok(Math.abs(peakHz(s) - 48.33) < 1.2, `peak at ${peakHz(s).toFixed(2)} Hz`);
});

test('pump: cavitation lifts the broadband floor monotonically and lowers current', () => {
  const floorAt = (sev: number) => {
    const s = new Simulator(31, 'slurry-pump');
    // measure inside the 1 s persistence window, before high severities trip and spin the pump down
    s.setTarget('severity', sev); run(s, 0.8);
    const sp = s.getSpectrum().latest;
    // median of bins away from the 1X/2X peaks
    const vals: number[] = [];
    for (let i = 0; i < sp.length; i++) { const f = (i * 200) / sp.length; if (Math.abs(f - 48.33) > 6 && Math.abs(f - 96.67) > 6) vals.push(sp[i]); }
    vals.sort((a, b) => a - b);
    return { floor: vals[Math.floor(vals.length / 2)], current: s.live.current };
  };
  const levels = [0, 0.25, 0.5, 0.75, 1].map(floorAt);
  for (let i = 1; i < levels.length; i++) {
    assert.ok(levels[i].floor > levels[i - 1].floor, `floor must rise: ${levels.map((l) => l.floor.toFixed(3))}`);
    assert.ok(levels[i].current < levels[i - 1].current, `current must fall: ${levels.map((l) => l.current.toFixed(2))}`);
  }
});

test('gearbox: GMF peak at teeth × rpm/60 with 1X sidebands that grow with pitting', () => {
  const P = ASSETS['helical-gearbox'];
  const gmf = gmfHz(P, P.nominal.rpm)!;
  near(gmf, (23 * 980) / 60, 1e-9);
  const at = (sev: number) => {
    const s = new Simulator(32, 'helical-gearbox');
    s.setTarget('severity', sev); run(s, 0.8); // before persistence could trip at high severity
    const sp = s.getSpectrum().latest;
    const f1 = s.live.rpm / 60;
    const g = binOf(s, gmf), lo = binOf(s, gmf - f1), hi = binOf(s, gmf + f1);
    const loc = (b: number) => Math.max(sp[b - 1], sp[b], sp[b + 1]);
    return { s, gmf: loc(g), lo: loc(lo), hi: loc(hi) };
  };
  const a = at(0.1), b = at(0.9);
  assert.ok(Math.abs(peakHz(b.s, 20) - gmf) < 3, `strongest peak above 1X should be the GMF (${peakHz(b.s, 20).toFixed(1)} Hz vs ${gmf.toFixed(1)})`);
  assert.ok(b.gmf > a.gmf * 2, 'GMF must grow with pitting');
  assert.ok(b.lo > a.lo * 3 && b.hi > a.hi * 3, 'sidebands must grow with pitting');
  assert.equal(b.s.getSpectrum().maxHz, 500);
  assert.ok(P.conceptNote.includes('ASSUMED'), 'tooth counts must be stated as assumed');
});

test('setAsset switches profile, resets to the new nominals and logs an INFO line with the concept tag', () => {
  const s = new Simulator(33);
  s.preset('critical'); run(s, 6);
  s.setAsset('helical-gearbox' as AssetId);
  assert.equal(s.state, 'NORMAL');
  assert.equal(s.relayClosed, true);
  assert.equal(s.live.rpm, 980);
  assert.equal(s.getSnapshot().asset, 'helical-gearbox');
  const logs = s.drainLogs().map((l) => l.text);
  assert.ok(logs.some((t) => t.includes('Helical gearbox') && t.includes('CONCEPT')));
  s.reset();
  assert.equal(s.profile.id, 'helical-gearbox', 'reset keeps the asset');
});

function near(a: number, b: number, eps: number) { assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`); }

console.log(`\n${passed} asset tests passed`);
