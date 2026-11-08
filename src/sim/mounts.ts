import type { V3 } from './shots';
import type { AssetId } from './assets';

/** a sensor attachment point on a host machine: a surface point, its outward normal, and a tangent axis */
export interface Mount {
  pos: V3;
  /** outward surface normal at the mount (unit) */
  normal: V3;
  /** tangent axis: probe direction, or the direction a power lead runs through a current sensor (unit) */
  axis: V3;
}

/** Phase 3 re-attaches the same sensor components to other machines through these */
export type SensorMounts = { puck: Mount; temp: Mount; current: Mount };

export type SensorKit = 'bench' | 'industrial';

export const SHAFT_Y = 0.85;
export const FLOOR_Y = -0.32;
export const PLATE_TOP = 0.04; // aluminium base plate on top of the rails (top face)

/** bench rig (12 V DC): mount points exported by the machine geometry in Scene.tsx */
export const BENCH_MOUNTS: SensorMounts = {
  // top of the pillow-block bearing cap
  puck: { pos: [0.5, SHAFT_Y + 0.24, 0], normal: [0, 1, 0], axis: [1, 0, 0] },
  // drive end of the motor housing, on top (fin tips at r = 0.5)
  temp: { pos: [-1.5, SHAFT_Y + 0.5, 0], normal: [0, 1, 0], axis: [1, 0, 0] },
  // on the motor power lead where it runs along the base plate
  current: { pos: [-0.4, 0.14, 0.62], normal: [0, 1, 0], axis: [1, 0, 0] },
};

// ------------------------------------------------------------------ edge node layout
export const NODE = {
  center: [0.2, -0.11, 2.35] as V3,
  size: [1.6, 0.42, 0.8] as V3,
};
const nodeRearZ = NODE.center[2] - NODE.size[2] / 2; // 1.95
export const GLAND_LEN = 0.17;

/** three cable glands on the rear wall (facing the machine). Index: 0 temperature, 1 current/power, 2 vibration */
export const GLANDS: V3[] = [
  [-0.15, -0.1, nodeRearZ],
  [0.4, -0.1, nodeRearZ],
  [0.95, -0.1, nodeRearZ],
];
/** where a cable enters a gland (tip of its strain-relief cone) */
export const glandTip = (i: number): V3 => [GLANDS[i][0], GLANDS[i][1], GLANDS[i][2] - GLAND_LEN];

// ------------------------------------------------------------------ cable routes (bench rig)
// Every harness ends in a gland. Routes stay outside the motor (r 0.5), cradle, bearing, guard and rails:
// they run on the base plate, cross the front rail at y >= 0.1 and drop to the gland height.
export const HARNESS = {
  /** puck conduit: from the boot on top of the puck, down the bearing side, to gland 2 */
  puck: [[0.5, SHAFT_Y + 0.62, 0], [0.51, SHAFT_Y + 0.74, 0.14], [0.66, 1.25, 0.42], [0.8, 0.5, 0.62], [0.88, 0.09, 0.86], [0.92, 0.12, 1.05], [0.95, 0.0, 1.45], glandTip(2)] as V3[],
  /** DS18B20 probe cable: from the probe tail, around the flange, along the plate to gland 0 */
  tempProbe: [[-1.34, SHAFT_Y + 0.53, 0], [-1.15, SHAFT_Y + 0.52, 0.14], [-1.0, 1.0, 0.62], [-0.98, 0.35, 0.78], [-0.9, 0.09, 0.9], [-0.55, 0.12, 1.02], [-0.25, 0.0, 1.45], glandTip(0)] as V3[],
  /** motor power lead: terminal cap -> through the current sensor -> gland 1 (cut-off inside the node) */
  power: [[-2.1, SHAFT_Y + 0.56, 0], [-2.3, 1.3, 0.48], [-2.0, 0.5, 0.62], [-1.4, 0.14, 0.62], [-0.8, 0.14, 0.62], [-0.1, 0.14, 0.62], [0.12, 0.14, 0.75], [0.3, 0.13, 1.02], [0.38, 0.0, 1.45], glandTip(1)] as V3[],
  /** 12 V adapter to the node's DC inlet on the left end wall */
  supply: [[-1.5, FLOOR_Y + 0.15, 2.3], [-1.0, -0.22, 2.36], [-0.68, -0.12, 2.36]] as V3[],
};

/** bench kit: 3-wire signal lead from the Hall module header to gland 1 */
export const HARNESS_BENCH_SIGNAL: V3[] = [[-0.35, 0.1, 0.71], [-0.15, 0.14, 0.88], [0.22, 0.15, 1.05], [0.35, 0.02, 1.45], [glandTip(1)[0] + 0.025, glandTip(1)[1] + 0.025, glandTip(1)[2]]];

/** industrial (concept) kit harness pieces that differ from the bench kit */
export const IR_BRACKET_BASE: V3 = [-1.05, PLATE_TOP, 1.0];
export const HARNESS_INDUSTRIAL = {
  /** MLX90614 canister cable: down the bracket post, off the plate edge, to gland 0 */
  irTemp: [[-1.04, 0.92, 1.04], [-1.0, 0.6, 1.07], [-0.97, 0.12, 1.18], [-0.6, -0.12, 1.4], [-0.25, -0.1, 1.6], glandTip(0)] as V3[],
  /** CT clamp secondary lead: from the clamp to gland 1 next to the power lead */
  ctOut: [[-0.4, 0.27, 0.62], [-0.3, 0.3, 0.7], [-0.15, 0.2, 0.88], [0.24, 0.16, 1.05], [0.36, 0.02, 1.45], [glandTip(1)[0] + 0.02, glandTip(1)[1] + 0.02, glandTip(1)[2]]] as V3[],
};

// ------------------------------------------------------------------ per-asset rigs (Phase 3)
// Every machine sits on the same base frame and plate and feeds the same edge node. Sensors snap to the
// machine's diagnostic tap points (mounts); every harness still ends in one of the three glands.
export interface RigLayout {
  shaftY: number;
  mounts: SensorMounts;
  /** IR bracket foot on the base plate and the barrel height (industrial kit) */
  irBase: V3;
  irBarrelY: number;
  /** puck conduit from the boot to gland 2 */
  puckRoute: V3[];
  /** motor power lead from the terminal box, through the current-sensor mount, to gland 1 */
  powerRoute: V3[];
  /** plan-view footprint for the minimap: [xMin, zMin, xMax, zMax] */
  footprint: [number, number, number, number];
}

/** IR canister barrel centre for a bracket foot (shared by TempSensor.IrPod and the cable router) */
export const irBarrel = (base: V3, y: number): V3 => [base[0] - 0.05, y, base[2] - 0.1];

/** MLX90614 cable: from the barrel's rear down the bracket post, off the plate edge, to gland 0 */
export function irRoute(base: V3, barrelY: number, aim: V3): V3[] {
  const b = irBarrel(base, barrelY);
  const d = [aim[0] - b[0], aim[1] - b[1], aim[2] - b[2]];
  const n = Math.hypot(d[0], d[1], d[2]) || 1;
  const rear: V3 = [b[0] - (d[0] / n) * 0.16, b[1] - (d[1] / n) * 0.16, b[2] - (d[2] / n) * 0.16];
  return [rear, [base[0] + 0.05, barrelY * 0.62, base[2] + 0.07], [base[0] + 0.08, 0.12, base[2] + 0.18], [(base[0] + glandTip(0)[0]) / 2, -0.12, 1.42], [glandTip(0)[0] - 0.02, -0.1, 1.62], glandTip(0)];
}

/** SCT-013 secondary lead: from the clamp's lead stub to gland 1, next to the power lead */
export function ctRoute(m: Mount): V3[] {
  const [x, y, z] = m.pos;
  const g = glandTip(1);
  return [[x, y + 0.13, z], [x + 0.1, y + 0.16, z + 0.08], [x + 0.25, 0.2, 0.88], [0.24, 0.16, 1.05], [0.36, 0.02, 1.45], [g[0] + 0.02, g[1] + 0.02, g[2]]];
}

const BENCH_RIG: RigLayout = {
  shaftY: SHAFT_Y,
  mounts: BENCH_MOUNTS,
  irBase: IR_BRACKET_BASE,
  irBarrelY: 0.98,
  puckRoute: HARNESS.puck,
  powerRoute: HARNESS.power,
  footprint: [-2.6, -0.5, 1.7, 0.75],
};

const PUMP_Y = 0.78;
const PUMP_RIG: RigLayout = {
  shaftY: PUMP_Y,
  mounts: {
    // top of the bearing frame (power end), between motor and casing
    puck: { pos: [-0.2, PUMP_Y + 0.2, 0], normal: [0, 1, 0], axis: [1, 0, 0] },
    // mechanical-seal end of the casing (dry running heats the seal first)
    temp: { pos: [0.2, PUMP_Y, 0.13], normal: [0, 0, 1], axis: [1, 0, 0] }, // side of the seal housing (r 0.12)
    current: { pos: [-0.9, 0.14, 0.62], normal: [0, 1, 0], axis: [1, 0, 0] },
  },
  irBase: [0.05, PLATE_TOP, 1.0],
  irBarrelY: 0.86,
  puckRoute: [[-0.2, PUMP_Y + 0.6, 0], [-0.2, PUMP_Y + 0.72, 0.14], [-0.12, 1.15, 0.45], [0.0, 0.5, 0.76], [0.05, 0.1, 0.96], [0.6, 0.12, 1.06], [0.95, 0.0, 1.45], glandTip(2)],
  powerRoute: [[-1.8, PUMP_Y + 0.5, 0], [-2.0, 1.15, 0.45], [-1.85, 0.5, 0.6], [-1.3, 0.14, 0.62], [-0.9, 0.14, 0.62], [-0.4, 0.14, 0.62], [0.1, 0.14, 0.75], [0.3, 0.13, 1.02], [0.38, 0.0, 1.45], glandTip(1)],
  footprint: [-2.3, -0.75, 1.55, 0.75],
};

const GEAR_IN_Y = 0.95;
const GEAR_RIG: RigLayout = {
  shaftY: GEAR_IN_Y,
  mounts: {
    // housing top, directly above the input-shaft bearing
    puck: { pos: [-0.25, 1.27, 0.15], normal: [0, 1, 0], axis: [1, 0, 0] },
    // front face of the housing at the input bearing
    temp: { pos: [-0.2, 0.9, 0.53], normal: [0, 0, 1], axis: [1, 0, 0] },
    current: { pos: [-1.0, 0.14, 0.62], normal: [0, 1, 0], axis: [1, 0, 0] },
  },
  irBase: [-0.45, PLATE_TOP, 1.02],
  irBarrelY: 0.88,
  puckRoute: [[-0.25, 1.66, 0.15], [-0.25, 1.78, 0.3], [-0.3, 1.3, 0.66], [-0.35, 0.6, 0.76], [-0.15, 0.1, 0.96], [0.6, 0.12, 1.06], [0.95, 0.0, 1.45], glandTip(2)],
  powerRoute: [[-1.9, GEAR_IN_Y + 0.48, 0], [-2.1, 1.3, 0.45], [-1.95, 0.6, 0.6], [-1.4, 0.14, 0.62], [-1.0, 0.14, 0.62], [-0.5, 0.14, 0.66], [0.1, 0.14, 0.78], [0.3, 0.13, 1.02], [0.38, 0.0, 1.45], glandTip(1)],
  footprint: [-2.4, -0.6, 1.6, 0.6],
};

export const RIGS: Record<AssetId, RigLayout> = {
  'bench-dc': BENCH_RIG,
  'induction-05hp': BENCH_RIG,
  'slurry-pump': PUMP_RIG,
  'helical-gearbox': GEAR_RIG,
};
