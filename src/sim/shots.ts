export type V3 = [number, number, number];

export interface CameraShot {
  id: number;
  name: ShotName;
  pos: V3;
  target: V3;
}

export type ShotName =
  | 'home' | 'sensors' | 'bearing' | 'wide' | 'trip'
  | 'motor' | 'mpu' | 'temp' | 'current' | 'flywheel' | 'edge';

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
};

let counter = 0;
export function makeShot(name: ShotName): CameraShot {
  const d = SHOT_DEFS[name];
  counter += 1;
  return { id: counter, name, pos: d.pos, target: d.target };
}
