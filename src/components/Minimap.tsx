import type { LabelRegistry } from './LabelLayer';
import type { ShotName } from '../sim/shots';

// top-down schematic: x in [-3.6, 3.6], z in [-1.5, 3.0]
const W = 168;
const H = 112;
const X0 = -3.6, X1 = 3.6, Z0 = -1.5, Z1 = 3.0;
const sx = (x: number) => ((x - X0) / (X1 - X0)) * W;
const sz = (z: number) => ((z - Z0) / (Z1 - Z0)) * H;

const DOTS: { id: ShotName; x: number; z: number; label: string }[] = [
  { id: 'motor', x: -1.8, z: 0, label: 'Motor' },
  { id: 'temp', x: -1.85, z: 0.0, label: 'DS18B20' },
  { id: 'mpu', x: 0.5, z: 0, label: 'MPU6050' },
  { id: 'flywheel', x: 1.4, z: 0, label: 'Flywheel' },
  { id: 'current', x: -0.4, z: 0.62, label: 'Current sensor' },
  { id: 'edge', x: 0.2, z: 2.35, label: 'ESP32 + cut-off' },
];

/** flat top-down schematic; click a point to move the camera there */
export function Minimap({ registry, onFocus }: { registry: { current: LabelRegistry }; onFocus: (n: ShotName) => void }) {
  const cam = registry.current.cam;
  const az = Math.atan2(cam.x - cam.tx, cam.z - cam.tz);
  const cx = sx(-0.2), cz = sz(0.6);
  const ex = Math.max(8, Math.min(W - 8, cx + Math.sin(az) * 70));
  const ez = Math.max(8, Math.min(H - 8, cz + Math.cos(az) * 50));
  return (
    <div className="pointer-events-auto rounded-md border border-line bg-panel p-1.5">
      <div className="mb-1 px-0.5 text-[11px] uppercase tracking-wider text-zinc-500">Plan view · click to focus</div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block rounded-sm bg-well">
        <rect x={sx(-3.2)} y={sz(-1)} width={sx(3.0) - sx(-3.2)} height={sz(1) - sz(-1)} fill="none" stroke="#3f3f46" strokeDasharray="3 3" />
        <rect x={sx(-2.45)} y={sz(-0.42)} width={sx(-1.15) - sx(-2.45)} height={sz(0.42) - sz(-0.42)} fill="#27272a" />
        <rect x={sx(0.3)} y={sz(-0.45)} width={sx(0.7) - sx(0.3)} height={sz(0.45) - sz(-0.45)} fill="#27272a" />
        <circle cx={sx(1.4)} cy={sz(0)} r={sz(0.58) - sz(0)} fill="#27272a" />
        <rect x={sx(-0.6)} y={sz(2.0)} width={sx(1.0) - sx(-0.6)} height={sz(2.75) - sz(2.0)} fill="#121215" stroke="#3f3f46" />
        <line x1={cx} y1={cz} x2={ex} y2={ez} stroke="#71717a" strokeWidth={1} strokeDasharray="2 2" />
        <rect x={ex - 3} y={ez - 3} width={6} height={6} fill="#e4e4e7" />
        {DOTS.map((d) => (
          <g key={d.id} style={{ cursor: 'pointer' }} onClick={() => onFocus(d.id)}>
            <circle cx={sx(d.x)} cy={sz(d.z)} r={4.5} fill="#a1a1aa" stroke="#09090b" strokeWidth={1.5} />
            <title>{d.label}</title>
          </g>
        ))}
      </svg>
    </div>
  );
}
