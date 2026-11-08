import { RIGS } from './mounts';
import type { AssetId } from './assets';

export type V3 = [number, number, number];

export interface CameraShot {
  id: number;
  name: ShotName;
  pos: V3;
  target: V3;
}

export type ShotName =
  | 'home' | 'sensors' | 'bearing' | 'wide' | 'trip'
  | 'motor' | 'mpu' | 'temp' | 'current' | 'flywheel' | 'edge'
  // Phase 2 hardware macro shots
  | 'rig' | 'nodeMacro' | 'puck' | 'clamp';

export const HOME_POS: V3 = [7.6, 4.4, 8.4];
export const HOME_TARGET: V3 = [-0.2, 0.75, 0.6];

const SHOT_DEFS: Record<ShotName, { pos: V3; target: V3 }> = {
  home: { pos: HOME_POS, target: HOME_TARGET },
  sensors: { pos: [3.0, 2.7, 4.8], target: [-0.7, 0.95, 0.4] },
  bearing: { pos: [2.5, 1.9, 3.1], target: [0.6, 0.95, 0.0] },
  wide: { pos: [6.6, 3.7, 7.4], target: [-0.2, 0.7, 0.6] },
  trip: { pos: [3.4, 2.1, 6.2], target: [0.4, 0.65, 1.3] },
  motor: { pos: [-2.2, 2.0, 4.2], target: [-1.8, 0.85, 0.0] },
  mpu: { pos: [1.6, 2.0, 2.6], target: [0.5, 1.1, 0.0] },
  temp: { pos: [-0.6, 2.3, 3.2], target: [-1.85, 1.2, 0.0] },
  current: { pos: [0.6, 1.4, 3.2], target: [-0.6, 0.2, 0.7] },
  flywheel: { pos: [4.2, 2.0, 3.2], target: [1.4, 0.85, 0.0] },
  edge: { pos: [2.6, 1.6, 5.6], target: [0.2, 0.1, 2.35] },
  rig: { pos: HOME_POS, target: HOME_TARGET },
  // high above the node's rear-right corner, looking down through the lid: PCB, end fins and the rear glands with their cables
  nodeMacro: { pos: [1.75, 2.35, 1.35], target: [0.2, -0.15, 2.3] },
  puck: { pos: [1.85, 1.95, 1.9], target: [0.5, 1.05, 0.1] },
  clamp: { pos: [0.55, 0.95, 2.0], target: [-0.4, 0.1, 0.62] },
};

/** per-asset framing for the hardware shots that follow the machine's tap points (bench rig keeps SHOT_DEFS) */
function assetShot(name: ShotName, asset: AssetId): { pos: V3; target: V3 } | null {
  if (asset === 'bench-dc' || asset === 'induction-05hp') return null;
  const m = RIGS[asset].mounts;
  const off = (p: V3, d: V3): V3 => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
  if (name === 'puck') return { target: off(m.puck.pos, [0, -0.05, 0.1]), pos: off(m.puck.pos, [1.35, 0.85, 1.8]) };
  if (name === 'clamp') return { target: m.current.pos, pos: off(m.current.pos, [0.95, 0.8, 1.38]) };
  if (name === 'temp') return { target: m.temp.pos, pos: off(m.temp.pos, [0.9, 0.7, 1.6]) };
  return null;
}

let counter = 0;
export function makeShot(name: ShotName, asset: AssetId = 'bench-dc'): CameraShot {
  const d = assetShot(name, asset) ?? SHOT_DEFS[name];
  counter += 1;
  return { id: counter, name, pos: d.pos, target: d.target };
}

export const SHOT_NAMES = Object.keys(SHOT_DEFS) as ShotName[];
export const shotDef = (name: ShotName) => SHOT_DEFS[name];
