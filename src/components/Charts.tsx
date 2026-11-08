import { useEffect, useRef } from 'react';
import type { Simulator } from '../sim/engine';
import { CONFIG as C } from '../sim/config';

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function useAnimatedCanvas(draw: Draw, fps = 24) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<Draw>(draw);
  drawRef.current = draw;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = 0;
    let w = 1;
    let h = 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.floor(r.width));
      h = Math.max(1, Math.floor(r.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (ts - last < 1000 / fps) return;
      last = ts;
      ctx.clearRect(0, 0, w, h);
      drawRef.current(ctx, w, h);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [fps]);
  return ref;
}

// ------------------------------------------------------------------ palette (canvas cannot read CSS variables cheaply)
const PLOT_BG = '#09090b';
const GRID = '#18181b';
const AXIS = '#3f3f46';
const TICK = '#71717a';
const TRACE = '#38bdf8';
const MARKER = '#a1a1aa';
const WARN = 'rgba(245,158,11,0.55)';
const CRIT = 'rgba(239,68,68,0.6)';
const MONO = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

// ------------------------------------------------------------------ FFT: single flat trace
/** Flat 1 px spectrum trace, 0-200 Hz, ticks every 25 Hz, dashed 1X marker. The engine's waterfall data is kept but not drawn (D8). */
export function drawSpectrum(sim: Simulator, ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const { latest, f1 } = sim.getSpectrum();
  const padL = 34, padR = 10, padT = 18, padB = 20;
  const pw = Math.max(1, w - padL - padR);
  const ph = Math.max(1, h - padT - padB);
  const n = latest.length;
  const yMax = 8.5;
  const xOf = (f: number) => padL + (f / C.fftMaxHz) * pw;
  const yOf = (v: number) => padT + ph - (Math.min(Math.max(v, 0), yMax) / yMax) * ph;

  ctx.fillStyle = PLOT_BG;
  ctx.fillRect(padL, padT, pw, ph);
  ctx.lineWidth = 1;
  ctx.font = MONO;

  // horizontal grid (mm/s)
  ctx.strokeStyle = GRID;
  ctx.fillStyle = TICK;
  ctx.textAlign = 'right';
  for (let v = 2; v <= 8; v += 2) {
    const y = Math.round(yOf(v)) + 0.5;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + pw, y); ctx.stroke();
    ctx.fillText(String(v), padL - 5, y + 3);
  }
  // vertical grid + Hz ticks every 25 Hz
  ctx.textAlign = 'center';
  for (let f = 0; f <= C.fftMaxHz; f += 25) {
    const x = Math.round(xOf(f)) + 0.5;
    ctx.strokeStyle = f === 0 ? AXIS : GRID;
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ph); ctx.stroke();
    ctx.fillText(String(f), x, h - 6);
  }
  ctx.strokeStyle = AXIS;
  ctx.beginPath(); ctx.moveTo(padL, padT + ph + 0.5); ctx.lineTo(padL + pw, padT + ph + 0.5); ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillText('mm/s', 2, padT - 6);
  ctx.textAlign = 'right';
  ctx.fillText('Hz', w - 2, padT - 6);

  // the trace
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = padL + (i / Math.max(1, n - 1)) * pw;
    const y = yOf(latest[i]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = TRACE;
  ctx.lineWidth = 1;
  ctx.stroke();

  // 1X marker (rotational frequency = rpm / 60)
  if (f1 > 1) {
    const x = Math.round(xOf(f1)) + 0.5;
    ctx.strokeStyle = MARKER;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ph); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#d4d4d8';
    ctx.textAlign = 'left';
    ctx.fillText(`1X ${f1.toFixed(2)} Hz`, Math.min(x + 4, w - 84), padT - 6);
  }
}

export function SpectrumChart({ sim }: { sim: Simulator }) {
  const ref = useAnimatedCanvas((ctx, w, h) => drawSpectrum(sim, ctx, w, h), 20);
  return <canvas ref={ref} className="block h-48 w-full" aria-label="Vibration spectrum, 0 to 200 Hz (synthetic)" />;
}

// ------------------------------------------------------------------ strip charts
interface StripProps {
  sim: Simulator;
  title: string;
  unit: string;
  pick: (h: { vib: number[]; cur: number[]; temp: number[] }) => number[];
  min: number;
  max: number;
  color?: string;
  warn?: number;
  crit?: number;
  decimals?: number;
}

/** 10 s rolling trace: 1 px line, no fill, dashed muted threshold lines, mono current-value readout */
export function drawStrip(sim: Simulator, props: StripProps, ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const { title, unit, pick, min, max, color = TRACE, warn, crit, decimals = 2 } = props;
  const data = pick(sim.history());
  const padL = 30, padR = 6, padT = 16, padB = 3;
  const pw = Math.max(1, w - padL - padR);
  const ph = Math.max(1, h - padT - padB);
  const yOf = (v: number) => padT + ph - ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * ph;

  ctx.fillStyle = PLOT_BG;
  ctx.fillRect(padL, padT, pw, ph);
  ctx.font = MONO;
  ctx.lineWidth = 1;

  // mid grid line
  ctx.strokeStyle = GRID;
  const yMid = Math.round(padT + ph / 2) + 0.5;
  ctx.beginPath(); ctx.moveTo(padL, yMid); ctx.lineTo(padL + pw, yMid); ctx.stroke();

  ctx.textAlign = 'right';
  ctx.fillStyle = TICK;
  ctx.fillText(String(max), padL - 4, padT + 8);
  ctx.fillText(String(min), padL - 4, padT + ph);

  const dash = (v: number | undefined, col: string) => {
    if (v === undefined) return;
    const y = Math.round(yOf(v)) + 0.5;
    ctx.strokeStyle = col;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + pw, y); ctx.stroke();
    ctx.setLineDash([]);
  };
  dash(warn, WARN);
  dash(crit, CRIT);

  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = padL + (i / (C.histLen - 1)) * pw;
    const y = yOf(data[i]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();

  const last = data.length ? data[data.length - 1] : 0;
  ctx.textAlign = 'left';
  ctx.fillStyle = TICK;
  ctx.fillText(title.toUpperCase(), padL, 10);
  ctx.textAlign = 'right';
  ctx.fillStyle = crit !== undefined && last >= crit ? '#ef4444' : warn !== undefined && last >= warn ? '#f59e0b' : '#e4e4e7';
  ctx.fillText(`${last.toFixed(decimals)} ${unit}`, padL + pw, 10);
}

export function StripChart(props: StripProps) {
  const { sim, title } = props;
  const ref = useAnimatedCanvas((ctx, w, h) => drawStrip(sim, props, ctx, w, h), 20);
  return <canvas ref={ref} className="block h-[76px] w-full" aria-label={`${title} trend, last 10 seconds (synthetic)`} />;
}

export function StripCharts({ sim }: { sim: Simulator }) {
  return (
    <div className="space-y-3">
      <StripChart sim={sim} title="Vibration RMS" unit="mm/s" pick={(h) => h.vib} min={0} max={10} warn={C.vib.warn} crit={C.vib.crit} />
      <StripChart sim={sim} title="Motor current" unit="A" pick={(h) => h.cur} min={0} max={5.5} crit={C.current.crit} />
      <StripChart sim={sim} title="Stator temperature" unit="°C" pick={(h) => h.temp} min={20} max={100} warn={C.temp.warn} crit={C.temp.crit} decimals={1} />
    </div>
  );
}
