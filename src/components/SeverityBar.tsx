import type { Snapshot, VibZone } from '../sim/engine';
import { CONFIG as C } from '../sim/config';

const ZONES: { z: VibZone; name: string; color: string }[] = [
  { z: 'A', name: 'Good', color: '#22c55e' },
  { z: 'B', name: 'Acceptable', color: '#a3e635' },
  { z: 'C', name: 'Advisory', color: '#f59e0b' },
  { z: 'D', name: 'Unacceptable', color: '#ef4444' },
];

const CX = 120;
const CY = 112;
const R = 86;
const SW = 22;

function pt(v: number, r: number): [number, number] {
  const a = Math.PI * (1 - Math.min(Math.max(v, 0), C.vib.gaugeMax) / C.vib.gaugeMax);
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}

function arc(v0: number, v1: number): string {
  const [x0, y0] = pt(v0, R);
  const [x1, y1] = pt(v1, R);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function VibrationGauge({ snap }: { snap: Snapshot }) {
  const bounds = [0, ...C.vib.zones, C.vib.gaugeMax];
  const active = snap.vibZone;
  const activeInfo = ZONES.find((z) => z.z === active) ?? ZONES[0];
  const deg = 180 * (Math.min(snap.vib, C.vib.gaugeMax) / C.vib.gaugeMax);
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2.5">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
        <span>Vibration severity · mm/s RMS</span>
        <span title="ISO 10816-3 defines zones A to D for larger industrial machines (it has been superseded by ISO 20816-3). The bands here borrow that scheme with illustrative limits and are not a claim of ISO compliance for this bench rig.">
          ISO 10816-3-style bands · illustrative ⓘ
        </span>
      </div>
      <svg viewBox="0 0 240 132" className="mx-auto block w-full max-w-[340px]" role="img" aria-label={`Vibration ${snap.vib.toFixed(2)} millimetres per second, zone ${active} ${activeInfo.name}`}>
        {ZONES.map((zn, i) => (
          <path key={zn.z} d={arc(bounds[i], bounds[i + 1])} fill="none" stroke={zn.color} strokeWidth={SW} strokeOpacity={zn.z === active ? 1 : 0.32} />
        ))}
        {/* zone letters on the arcs */}
        {ZONES.map((zn, i) => {
          const mid = (bounds[i] + bounds[i + 1]) / 2;
          const [x, y] = pt(mid, R);
          return (
            <text key={zn.z} x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight={700} fill="#09090b">
              {zn.z}
            </text>
          );
        })}
        {/* boundary ticks and values */}
        {C.vib.zones.map((b) => {
          const [x0, y0] = pt(b, R - SW / 2 - 2);
          const [x1, y1] = pt(b, R + SW / 2 + 3);
          const [tx, ty] = pt(b, R + SW / 2 + 12);
          return (
            <g key={b}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#e4e4e7" strokeWidth={1} />
              <text x={tx} y={ty + 3} textAnchor="middle" fontSize="8.5" fill="#a1a1aa">{b}</text>
            </g>
          );
        })}
        <text x={pt(0, R)[0]} y={CY + 14} textAnchor="middle" fontSize="8.5" fill="#71717a">0</text>
        <text x={pt(C.vib.gaugeMax, R)[0]} y={CY + 14} textAnchor="middle" fontSize="8.5" fill="#71717a">{C.vib.gaugeMax}+</text>
        {/* needle (points left at 0, rotates clockwise over the top) */}
        <g style={{ transform: `rotate(${deg}deg)`, transformOrigin: `${CX}px ${CY}px`, transition: 'transform 0.18s linear' }}>
          <line x1={CX} y1={CY} x2={CX - (R - SW / 2 - 6)} y2={CY} stroke="#f4f4f5" strokeWidth={2.5} strokeLinecap="round" />
        </g>
        <circle cx={CX} cy={CY} r={5} fill="#f4f4f5" stroke="#09090b" strokeWidth={2} />
        <text x={CX} y={CY - 28} textAnchor="middle" fontSize="20" fontWeight={700} fill={activeInfo.color} style={{ fontFamily: 'ui-monospace, monospace' }}>
          {snap.vib.toFixed(2)}
        </text>
        <text x={CX} y={CY - 15} textAnchor="middle" fontSize="9" fill="#a1a1aa">mm/s RMS</text>
      </svg>
      {!snap.relayClosed && snap.rpm < 5 && (
        <div className="mt-1 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-center text-[10px] text-red-200">
          Motor stopped: the safety cut-off is open, so vibration reads about zero. The CRITICAL state stays latched until reset.
        </div>
      )}
      <div className="mt-1 grid grid-cols-4 gap-1 text-center text-[10px]">
        {ZONES.map((zn) => (
          <div key={zn.z} className="rounded px-1 py-0.5" style={{ background: zn.z === active ? zn.color : 'transparent', color: zn.z === active ? '#09090b' : '#a1a1aa', border: `1px solid ${zn.color}55` }}>
            <b>{zn.z}</b> {zn.name}
          </div>
        ))}
      </div>
    </div>
  );
}
