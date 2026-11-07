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

// ------------------------------------------------------------------ FFT waterfall
export function drawSpectrum(sim: Simulator, ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const { waterfall, f1 } = sim.getSpectrum();
    const padL = 34, padR = 10, padT = 8, padB = 22;
    const pw = w - padL - padR;
    const ph = h - padT - padB;
    const n = C.fftBins;
    const yMax = 8.5;
    const rows = waterfall.length;
    const depthX = 26; // total perspective shift
    const depthY = ph * 0.34;

    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(padL, padT, pw, ph);

    // x axis grid + labels
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#71717a';
    ctx.strokeStyle = '#1f1f23';
    ctx.lineWidth = 1;
    for (let f = 0; f <= C.fftMaxHz; f += 25) {
      const x = padL + (f / C.fftMaxHz) * (pw - depthX);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ph); ctx.stroke();
      ctx.fillText(String(f), x, h - 8);
    }
    ctx.textAlign = 'left';
    ctx.fillText('Hz', w - 18, h - 8);
    ctx.textAlign = 'right';
    ctx.fillText('mm/s', padL - 4, padT + 10);

    const baseY = padT + ph - 2;
    for (let k = 0; k < rows; k++) {
      const age = rows - 1 - k; // 0 = newest
      const depth = age / Math.max(1, C.waterfallLen - 1);
      const ox = padL + depth * depthX;
      const oy = baseY - (1 - depth) * 0; // newest at the front (bottom)
      const yShift = -depth * depthY;
      const sp = waterfall[k];
      const scale = (ph * 0.55) / yMax;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = ox + (i / (n - 1)) * (pw - depthX);
        const y = oy + yShift - Math.min(sp[i], yMax) * scale;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      // occlusion fill (painter's algorithm)
      ctx.lineTo(ox + (pw - depthX), oy + yShift);
      ctx.lineTo(ox, oy + yShift);
      ctx.closePath();
      ctx.fillStyle = 'rgba(10,10,12,0.92)';
      ctx.fill();
      const newest = age === 0;
      ctx.strokeStyle = newest ? '#22d3ee' : `rgba(56,189,248,${0.12 + 0.4 * (1 - depth)})`;
      ctx.lineWidth = newest ? 1.8 : 1;
      ctx.stroke();
    }

    // 1X marker on the newest trace
    if (f1 > 1) {
      const x = padL + (f1 / C.fftMaxHz) * (pw - depthX);
      ctx.strokeStyle = 'rgba(251,191,36,0.9)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, padT + 4); ctx.lineTo(x, padT + ph); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fbbf24';
      ctx.textAlign = 'left';
      ctx.fillText(`1X = ${f1.toFixed(2)} Hz`, Math.min(x + 4, w - 90), padT + 12);
    }
}

export function SpectrumChart({ sim }: { sim: Simulator }) {
  const ref = useAnimatedCanvas((ctx, w, h) => drawSpectrum(sim, ctx, w, h), 20);
  return <canvas ref={ref} className="block h-52 w-full rounded-md" aria-label="Vibration spectrum waterfall (synthetic)" />;
}

// ------------------------------------------------------------------ strip charts
interface StripProps {
  sim: Simulator;
  title: string;
  unit: string;
  pick: (h: { vib: number[]; cur: number[]; temp: number[] }) => number[];
  min: number;
  max: number;
  color: string;
  warn?: number;
  crit?: number;
  decimals?: number;
}

export function drawStrip(sim: Simulator, props: StripProps, ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const { title, unit, pick, min, max, color, warn, crit, decimals = 2 } = props;
    const data = pick(sim.history());
    const padL = 30, padR = 6, padT = 14, padB = 4;
    const pw = w - padL - padR;
    const ph = h - padT - padB;
    const yOf = (v: number) => padT + ph - ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * ph;

    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(padL, padT, pw, ph);
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#71717a';
    ctx.fillText(String(max), padL - 3, padT + 8);
    ctx.fillText(String(min), padL - 3, padT + ph);

    const dash = (v: number | undefined, col: string) => {
      if (v === undefined) return;
      const y = yOf(v);
      ctx.strokeStyle = col;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + pw, y); ctx.stroke();
      ctx.setLineDash([]);
    };
    ctx.lineWidth = 1;
    dash(warn, 'rgba(245,158,11,0.7)');
    dash(crit, 'rgba(239,68,68,0.8)');

    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = padL + (i / (C.histLen - 1)) * pw;
      const y = yOf(data[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#a1a1aa';
    ctx.fillText(title, padL, 10);
    const last = data.length ? data[data.length - 1] : 0;
    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.fillText(`${last.toFixed(decimals)} ${unit}`, padL + pw, 10);
}

export function StripChart(props: StripProps) {
  const { sim, title } = props;
  const ref = useAnimatedCanvas((ctx, w, h) => drawStrip(sim, props, ctx, w, h), 20);
  return <canvas ref={ref} className="block h-[88px] w-full rounded-md" aria-label={`${title} trend, last 10 seconds (synthetic)`} />;
}

export function StripCharts({ sim }: { sim: Simulator }) {
  return (
    <div className="space-y-2">
      <StripChart sim={sim} title="Vibration RMS" unit="mm/s" pick={(h) => h.vib} min={0} max={10} color="#22d3ee" warn={C.vib.warn} crit={C.vib.crit} />
      <StripChart sim={sim} title="Current" unit="A" pick={(h) => h.cur} min={0} max={5.5} color="#a78bfa" crit={C.current.crit} />
      <StripChart sim={sim} title="Stator temperature" unit="°C" pick={(h) => h.temp} min={20} max={100} color="#fb923c" warn={C.temp.warn} crit={C.temp.crit} decimals={1} />
    </div>
  );
}
