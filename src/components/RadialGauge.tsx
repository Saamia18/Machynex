import { Info } from 'lucide-react';
import type { Snapshot, VibZone } from '../sim/engine';
import type { Thresholds } from '../sim/assets';
import { ISO_CAVEAT } from './SeverityBar';

// Restored semicircular severity gauge (user review, Phase 3). Flat solid fills only, no glow.
// Layout rule from Phase 0 defect 3: the numeric readout sits BELOW the arc's baseline, where the needle never goes,
// so needle and numbers can no longer overlap.

const CX = 120, CY = 112, R = 86, SW = 16;

const ZONES: { z: VibZone; name: string; color: string }[] = [
  { z: 'A', name: 'good', color: '#10b981' },
  { z: 'B', name: 'acceptable', color: '#10b981' },
  { z: 'C', name: 'advisory', color: '#f59e0b' },
  { z: 'D', name: 'unacceptable', color: '#ef4444' },
];

function pt(v: number, r: number, max: number): [number, number] {
  const a = Math.PI * (1 - Math.min(Math.max(v, 0), max) / max);
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}
function arc(v0: number, v1: number, max: number, r = R): string {
  const [x0, y0] = pt(v0, r, max);
  const [x1, y1] = pt(v1, r, max);
  const large = 0; // never more than 180 degrees
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function RadialGauge({ snap, th }: { snap: Snapshot; th: Thresholds }) {
  const max = th.gaugeMax;
  const bounds = [0, ...th.zones, max];
  const active = ZONES.find((z) => z.z === snap.vibZone) ?? ZONES[0];
  const latched = !snap.relayClosed;
  const v = Math.min(Math.max(snap.vib, 0), max);
  const fill = latched ? '#71717a' : active.color;
  const deg = 180 * (v / max);
  const [nx, ny] = pt(v, R - SW / 2 - 6, max);

  return (
    <div className="rounded-md border border-line bg-panel px-3 pb-2 pt-2.5">
      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
        <span className="font-medium uppercase tracking-wider">Vibration severity</span>
        <span className="flex items-center gap-1 whitespace-nowrap" title={ISO_CAVEAT}>
          ISO 10816-3-style · illustrative <Info size={11} aria-label={ISO_CAVEAT} />
        </span>
      </div>
      <svg viewBox="0 0 240 150" className="mx-auto mt-1 block w-full max-w-[360px]" role="img" aria-label={`Vibration ${snap.vib.toFixed(2)} millimetres per second, zone ${active.z} ${latched ? 'interlock latched' : active.name}`}>
        {/* zone track (muted) */}
        {ZONES.map((zn, i) => (
          <path key={zn.z} d={arc(bounds[i], bounds[i + 1], max)} fill="none" stroke={zn.color} strokeOpacity={0.18} strokeWidth={SW} />
        ))}
        {/* value fill from 0 to the reading, in the active zone colour */}
        {v > 0.01 && <path d={arc(0, v, max)} fill="none" stroke={fill} strokeWidth={SW} />}
        {/* zone boundaries + values outside the arc */}
        {th.zones.map((b) => {
          const [x0, y0] = pt(b, R - SW / 2, max);
          const [x1, y1] = pt(b, R + SW / 2 + 2, max);
          const [tx, ty] = pt(b, R + SW / 2 + 11, max);
          return (
            <g key={b}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#09090b" strokeWidth={2} />
              <text x={tx} y={ty + 3} textAnchor="middle" fontSize="9" fill="#a1a1aa" style={{ fontFamily: 'ui-monospace, monospace' }}>{b}</text>
            </g>
          );
        })}
        {/* zone letters along the arc */}
        {ZONES.map((zn, i) => {
          const mid = (bounds[i] + bounds[i + 1]) / 2;
          const [x, y] = pt(mid, R, max);
          const on = v >= mid; // dark letter only where the fill actually covers it
          return (
            <text key={zn.z} x={x} y={y + 3.5} textAnchor="middle" fontSize="10" fontWeight={700} fill={on ? '#09090b' : '#a1a1aa'} style={{ fontFamily: 'ui-monospace, monospace' }}>
              {zn.z}
            </text>
          );
        })}
        <text x={pt(0, R, max)[0]} y={CY + 14} textAnchor="middle" fontSize="9" fill="#71717a" style={{ fontFamily: 'ui-monospace, monospace' }}>0</text>
        <text x={pt(max, R, max)[0]} y={CY + 14} textAnchor="middle" fontSize="9" fill="#71717a" style={{ fontFamily: 'ui-monospace, monospace' }}>{max}+</text>
        {/* needle (upper half only) */}
        <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#f4f4f5" strokeWidth={2} strokeLinecap="round" style={{ transition: 'all 0.18s linear' }} data-deg={deg.toFixed(1)} />
        <circle cx={CX} cy={CY} r={4} fill="#f4f4f5" stroke="#09090b" strokeWidth={2} />
        {/* readout below the baseline: the needle never reaches here */}
        <text x={CX} y={CY + 26} textAnchor="middle" fontSize="20" fill="#f4f4f5" style={{ fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums' }}>
          {snap.vib.toFixed(2)}
          <tspan fontSize="10" fill="#71717a"> mm/s RMS</tspan>
        </text>
      </svg>
      <div className="mt-0.5 grid grid-cols-4 gap-px overflow-hidden rounded-sm text-center text-[10px]">
        {ZONES.map((zn) => {
          const on = zn.z === active.z;
          return (
            <div key={zn.z} className="font-mono py-0.5" style={{ background: on ? (latched ? '#3f3f46' : zn.color) : '#18181b', color: on ? (latched ? '#e4e4e7' : '#09090b') : '#71717a' }}>
              {zn.z} {zn.name}
            </div>
          );
        })}
      </div>
      {latched && <div className="mt-1.5 text-[10px] leading-snug text-zinc-400">Interlock latched: the reading falls as the shaft spins down. The trip stays latched until reset.</div>}
    </div>
  );
}
