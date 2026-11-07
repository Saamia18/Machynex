import assert from 'node:assert/strict';
import { drawSpectrum, drawStrip } from '../src/components/Charts';
import { Simulator } from '../src/sim/engine';
import { CONFIG as C } from '../src/sim/config';

// recording fake 2D context: any method is a no-op that is counted, any property assignable
function fakeCtx() {
  const calls: Record<string, number> = {};
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get: (t, k: string) => (k in t ? t[k] : (...a: unknown[]) => { calls[k] = (calls[k] ?? 0) + 1; void a; }),
    set: (t, k: string, v) => { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}
const run = (s: Simulator, sec: number) => { for (let i = 0; i < sec / C.tickS; i++) s.step(C.tickS); };

const sim = new Simulator(3);
for (const [label, setup] of [
  ['boot', () => {}], ['baseline', () => run(sim, 4)], ['progressive', () => { sim.preset('progressive'); run(sim, 9); }],
  ['critical+stopped (f1=0)', () => { sim.preset('critical'); run(sim, 10); }],
] as [string, () => void][]) {
  setup();
  for (const [w, h] of [[640, 210], [320, 150], [1, 1]]) {
    const a = fakeCtx(); drawSpectrum(sim, a.ctx, w, h);
    assert.ok((a.calls.stroke ?? 0) > 10, `${label}: spectrum should stroke many lines`);
    const b = fakeCtx();
    drawStrip(sim, { sim, title: 'Vibration RMS', unit: 'mm/s', pick: (x) => x.vib, min: 0, max: 10, color: '#22d3ee', warn: 2.8, crit: 4.5 }, b.ctx, w, h);
    assert.ok((b.calls.stroke ?? 0) >= 3, `${label}: strip should draw trace + threshold lines`);
  }
  console.log('  ok  ', label);
}
console.log('charts draw without throwing at 640x210, 320x150 and degenerate 1x1');
