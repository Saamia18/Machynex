import type { LabelRegistry } from './LabelLayer';
import type { ShotName } from '../sim/shots';

// top-down schematic: x in [-3.6, 3.6], z in [-1.5, 3.0]
const W = 168;
const H = 112;
const X0 = -3.6, X1 = 3.6, Z0 = -1.5, Z1 = 3.0;
const sx = (x: number) => ((x - X0) / (X1 - X0)) * W;
const sz = (z: number) => ((z - Z0) / (Z1 - Z0)) * H;

const DOTS: { id: ShotName; key: string; x: number; z: number; label: string; color: string }[] = [
  { id: 'motor', key: 'motor', x: -1.8, z: 0, label: 'Motor', color: '#38bdf8' },
  { id: 'temp', key: 'temp', x: -1.85, z: 0.0, label: 'DS18B20', color: '#fb923c' },
  { id: 'mpu', key: 'mpu', x: 0.5, z: 0, label: 'MPU6050', color: '#22d3ee' },
  { id: 'flywheel', key: 'flywheel', x: 1.4, z: 0, label: 'Flywheel', color: '#f97316' },
  { id: 'current', key: 'current', x: -0.6, z: 0.72, label: 'Current (opt.)', color: '#a78bfa' },
  { id: 'edge', key: 'edge', x: 0.2, z: 2.35, label: 'ESP32 + cut-off', color: '#34d399' },
];

export function Minimap({ registry, enabled, onFocus, onToggle }: { registry: { current: LabelRegistry }; enabled: Record<string, boolean>; onFocus: (n: ShotName) => void; onToggle: (key: string) => void }) {
  const cam = registry.current.cam;
  const az = Math.atan2(cam.x - cam.tx, cam.z - cam.tz);
  const cx = sx(-0.2), cz = sz(0.6);
  const ex = Math.max(8, Math.min(W - 8, cx + Math.sin(az) * 70));
  const ez = Math.max(8, Math.min(H - 8, cz + Math.cos(az) * 50));
  return (
    <div className="pointer-events-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-1.5 backdrop-blur">
      <div className="mb-1 flex items-center justify-between px-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
        <span>Minimap · click to focus</span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block rounded bg-zinc-900">
        <rect x={sx(-3.2)} y={sz(-1)} width={sx(3.0) - sx(-3.2)} height={sz(1) - sz(-1)} fill="none" stroke="#52525b" strokeDasharray="3 3" />
        <rect x={sx(-2.45)} y={sz(-0.42)} width={sx(-1.15) - sx(-2.45)} height={sz(0.42) - sz(-0.42)} fill="#2b4a52" opacity={0.9} />
        <rect x={sx(0.3)} y={sz(-0.45)} width={sx(0.7) - sx(0.3)} height={sz(0.45) - sz(-0.45)} fill="#52525b" />
        <circle cx={sx(1.4)} cy={sz(0)} r={sz(0.58) - sz(0)} fill="#a8b0ba" opacity={0.8} />
        <rect x={sx(-0.6)} y={sz(2.0)} width={sx(1.0) - sx(-0.6)} height={sz(2.75) - sz(2.0)} fill="#18181b" stroke="#52525b" />
        <line x1={cx} y1={cz} x2={ex} y2={ez} stroke="#fbbf24" strokeWidth={1} strokeDasharray="2 2" opacity={0.8} />
        <circle cx={ex} cy={ez} r={4} fill="#fbbf24" />
        {DOTS.map((d) => (
          <g key={d.key} style={{ cursor: 'pointer' }} onClick={() => onFocus(d.id)}>
            <circle cx={sx(d.x)} cy={sz(d.z)} r={5.5} fill={d.color} opacity={enabled[d.key] === false ? 0.25 : 0.95} stroke="#09090b" strokeWidth={1.5} />
            <title>{d.label}</title>
          </g>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 px-0.5">
        {DOTS.map((d) => (
          <label key={d.key} className="flex cursor-pointer items-center gap-1 text-[10px] text-zinc-400">
            <input type="checkbox" checked={enabled[d.key] !== false} onChange={() => onToggle(d.key)} />
            <span style={{ color: d.color }}>●</span>{d.label}
          </label>
        ))}
      </div>
    </div>
  );
}
