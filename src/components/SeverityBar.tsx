import { Info } from 'lucide-react';
import type { Snapshot, VibZone } from '../sim/engine';
import { CONFIG as C } from '../sim/config';

export const ISO_CAVEAT =
  'ISO 10816-3-style bands (1.4 / 2.8 / 4.5 mm/s) are illustrative placeholders. ISO 10816-3 has been superseded by ISO 20816-3, ' +
  'which covers machines above 15 kW. This bench rig is far below that scope: no ISO compliance is claimed.';

const ZONES: { z: VibZone; name: string; color: string }[] = [
  { z: 'A', name: 'good', color: 'var(--mx-ok)' },
  { z: 'B', name: 'acceptable', color: 'var(--mx-ok)' },
  { z: 'C', name: 'advisory', color: 'var(--mx-warn)' },
  { z: 'D', name: 'unacceptable', color: 'var(--mx-crit)' },
];

/** value -> 0..1 across four equal-width segments (piecewise linear inside each zone) */
export function severityPos(v: number): number {
  const b = [0, ...C.vib.zones, C.vib.gaugeMax];
  const x = Math.min(Math.max(v, 0), C.vib.gaugeMax);
  for (let i = 0; i < 4; i++) {
    if (x <= b[i + 1] || i === 3) return (i + (x - b[i]) / (b[i + 1] - b[i])) / 4;
  }
  return 1;
}

/** compact horizontal A | B | C | D severity bar, docked bottom-left over the 3D view */
export function SeverityBar({ snap }: { snap: Snapshot }) {
  const active = ZONES.find((z) => z.z === snap.vibZone) ?? ZONES[0];
  const pos = severityPos(snap.vib);
  const latched = !snap.relayClosed;
  return (
    <div className="w-72 rounded-md border border-line bg-panel px-3 py-2" aria-label="Vibration severity">
      <div className="flex items-center justify-between gap-2 whitespace-nowrap text-[11px] text-zinc-500">
        <span className="font-medium uppercase tracking-wider">Severity</span>
        <span className="flex items-center gap-1" title={ISO_CAVEAT}>
          ISO 10816-3-style · illustrative <Info size={11} aria-label={ISO_CAVEAT} />
        </span>
      </div>

      <div className="relative mt-2">
        <div className="grid h-4 grid-cols-4 gap-px overflow-hidden rounded-sm">
          {ZONES.map((z) => {
            const on = z.z === active.z;
            // a latched trip shows the zone in neutral grey: the reading falls during spin-down and must not look like recovery
            const fill = latched ? '#71717a' : z.color;
            return (
              <div
                key={z.z}
                className={`font-mono flex items-center justify-center text-[10px] ${on ? 'font-semibold text-zinc-950' : 'text-zinc-500'}`}
                style={{ background: on ? fill : '#1c1c20' }}
              >
                {z.z}
              </div>
            );
          })}
        </div>
        <div className="absolute -bottom-0.5 -top-0.5 w-px bg-zinc-100" style={{ left: `calc(${(pos * 100).toFixed(2)}% - 0.5px)` }} />
      </div>

      <div className="font-mono mt-1 grid grid-cols-4 text-[10px] text-zinc-600">
        <span>0</span>
        {C.vib.zones.map((b) => <span key={b} className="-ml-1.5">{b}</span>)}
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-2 whitespace-nowrap">
        <span className="font-mono text-lg leading-none text-zinc-100">
          {snap.vib.toFixed(2)}<span className="ml-1 text-xs text-zinc-500">mm/s RMS</span>
        </span>
        <span className="font-mono text-[11px]" style={{ color: latched ? '#a1a1aa' : active.color }}>
          {latched ? `Zone ${active.z} · latched` : `Zone ${active.z} · ${active.name}`}
        </span>
      </div>
      {latched && (
        <div className="mt-1.5 border-t border-line pt-1.5 text-[10px] leading-snug text-zinc-400">
          Interlock latched. Reading falls as the shaft spins down; the trip stays latched until reset.
        </div>
      )}
    </div>
  );
}
