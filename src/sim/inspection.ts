// Exploded component inspection: suite order, presentation card data and macro camera framing.
// Pure functions (no React / three), unit-tested in tests/inspection.test.ts.
// Bus, sampling and part data come from hardwareSpecs.ts (datasheet-sourced); nothing here adds a new hardware figure.

import { inspectorEntry } from './hardwareSpecs';
import type { HardwareId } from './hardwareSpecs';
import { NODE, RIGS, irBarrel } from './mounts';
import type { SensorKit } from './mounts';
import type { AssetId } from './assets';
import type { CameraShot, ShotName, V3 } from './shots';

/** the inspected part rises this far along its mounting normal (scene units) */
export const INSPECT_LIFT = 0.2;
/** everything except the inspected part fades to this opacity */
export const INSPECT_FADE = 0.16;
/** width the left overlay covers on the canvas (px): the macro shot frames the part in the remaining area */
export const SUITE_PANEL_PX = 300;

/** only the proposal's 12 V bench rig is DC; the concept machines are AC-driven (an AC clamp / AC relay is valid there) */
export const isAcMachine = (asset: AssetId): boolean => asset !== 'bench-dc';

export const SUITE_ORDER: HardwareId[] = ['node', 'vibration', 'current', 'temperature'];
export const SUITE_CODE: Record<HardwareId, string> = { node: 'NODE-01', vibration: 'VB-01', current: 'CT-01', temperature: 'TP-01' };

export function suiteName(id: HardwareId, kit: SensorKit): string {
  switch (id) {
    case 'node': return 'Edge Box';
    case 'vibration': return 'Vibration Pod';
    case 'current': return kit === 'industrial' ? 'Current Clamp' : 'Current Sensor';
    case 'temperature': return kit === 'industrial' ? 'IR Thermal Probe' : 'Thermal Probe';
  }
}

/** Prev / Next through the suite, wrapping at both ends */
export function stepSuite(id: HardwareId, dir: 1 | -1): HardwareId {
  const n = SUITE_ORDER.length;
  return SUITE_ORDER[(SUITE_ORDER.indexOf(id) + dir + n) % n];
}

export interface SuiteCard {
  code: string;
  name: string;
  /** not in the proposed bill of materials (from hardwareSpecs) */
  concept: boolean;
  measures: string;
  bandwidth: string;
  enclosure: string;
  ic: string;
  bus: string;
  role: string;
  /** labels of rows whose figures were not checked against a datasheet */
  unverified: string[];
  /** extra honesty note shown under the card header */
  note?: string;
}

/**
 * Card data for one part. `acMachine` is false on the 12 V DC bench rig (where an AC clamp or AC relay cannot work).
 */
export function suiteCard(id: HardwareId, kit: SensorKit, acMachine: boolean): SuiteCard {
  const e = inspectorEntry(id, kit);
  const ind = kit === 'industrial';
  const base = { code: SUITE_CODE[id], name: suiteName(id, kit), concept: e.concept, bus: e.protocol, bandwidth: e.samplingRate };
  switch (id) {
    case 'node':
      return {
        ...base,
        measures: 'Aggregates the vibration, temperature and current channels',
        enclosure: 'Die-cast IP65-style box · concept packaging, not rated or tested',
        ic: ind ? 'Espressif ESP32-S3-WROOM-1 module' : 'Espressif ESP32-WROOM-32 on an ESP32 DevKit V1',
        role: ind
          ? 'Runs the edge threshold rules and drives the concept cut-off when the hard vibration limit is crossed.'
          : 'Collects every channel and streams it to the laptop, where the persistence, hysteresis and hard-limit rules run.',
        unverified: ind ? ['Cut-off latency'] : [],
        note: ind
          ? (acMachine ? 'Cut-off element: AC solid-state relay (concept).' : 'Cut-off element on this DC rig: DC-rated switch (concept). An AC relay cannot switch DC.')
          : 'Enclosure and safety cut-off are a concept add-on, not in the proposed bill of materials.',
      };
    case 'vibration':
      return {
        ...base,
        measures: 'Acceleration on three axes at the bearing housing',
        enclosure: 'Potted stainless puck on an M6 stud · concept packaging, no rating claimed',
        ic: ind ? 'ADXL345-class MEMS accelerometer' : 'InvenSense MPU6050 MEMS accelerometer / gyro',
        role: ind
          ? 'Bearing-housing vibration: picks up 1X imbalance and higher fault tones within its bandwidth.'
          : 'Main evidence channel: rotor imbalance shows up as a rise at the 1X shaft frequency.',
        unverified: ind ? ['Bandwidth'] : [],
        note: ind ? undefined : 'Bandwidth limit: content above about 500 Hz needs a wider-bandwidth sensor.',
      };
    case 'current':
      return ind
        ? {
            ...base,
            measures: 'AC motor current (rms) on one lead, non-invasive',
            enclosure: 'Hinged nylon split-core housing · rating not checked',
            ic: 'YHDC SCT-013-030 passive current transformer',
            role: 'Corroborates a vibration alarm through a change in motor load. AC only.',
            unverified: ['Bandwidth', 'Rating'],
            note: acMachine ? undefined : 'Preview only: a current transformer cannot measure this rig’s DC lead.',
          }
        : {
            ...base,
            measures: 'DC motor current through an in-line Hall-effect sensor',
            enclosure: 'Open PCB module · needs a cover on a real rig',
            ic: 'Allegro ACS712ELCTR-05B (SOIC-8)',
            role: 'Optional channel: a load change can corroborate a vibration alarm. Kept only if a pilot shows a usable signal.',
            unverified: [],
          };
    case 'temperature':
      return ind
        ? {
            ...base,
            measures: 'Non-contact surface temperature at the drive end',
            enclosure: 'M12 stainless barrel on a slotted bracket · concept packaging, no rating claimed',
            ic: 'Melexis MLX90614 infrared thermometer',
            role: 'Corroborates a vibration alarm with a stator temperature trend, without touching the machine.',
            unverified: [],
          }
        : {
            ...base,
            measures: 'Housing surface temperature by contact',
            enclosure: 'Stainless sleeve probe in a clamp saddle · no rating claimed',
            ic: 'Maxim DS18B20 digital thermometer',
            role: 'Slow trend channel: friction or overload shows up as a gradual housing temperature rise.',
            unverified: [],
          };
  }
}

export interface LiveInputs { state: string; relayClosed: boolean; vib: number; current: number; temp: number }
export interface LiveReading { label: string; value: string; unit: string }

/** the simulated value shown at the top of the card */
export function liveReading(id: HardwareId, s: LiveInputs): LiveReading {
  const f = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  switch (id) {
    case 'node': return { label: s.relayClosed ? 'Cut-off energized' : 'Cut-off tripped', value: s.state, unit: '' };
    case 'vibration': return { label: 'Vibration velocity', value: f(s.vib, 2), unit: 'mm/s RMS' };
    case 'current': return { label: 'Motor current', value: f(s.current, 2), unit: 'A' };
    case 'temperature': return { label: 'Temperature', value: f(s.temp, 1), unit: '°C' };
  }
}

// ------------------------------------------------------------------ macro camera framing
const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const unit = (v: V3): V3 => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };

/** where the lifted part sits and where the camera looks from (before the overlay offset applied by the director) */
export function inspectFrame(id: HardwareId, asset: AssetId, kit: SensorKit): { name: ShotName; target: V3; pos: V3 } {
  const rig = RIGS[asset];
  const m = rig.mounts;
  switch (id) {
    case 'node': {
      const t: V3 = [NODE.center[0], NODE.center[1] + 0.12 + INSPECT_LIFT, NODE.center[2]];
      return { name: 'nodeMacro', target: t, pos: add(t, unit([0.4, 0.8, 1]), 2.3) };
    }
    case 'vibration': {
      const t = add(m.puck.pos, m.puck.normal, INSPECT_LIFT + 0.2);
      return { name: 'puck', target: t, pos: add(t, unit([0.75, 0.55, 1]), 1.15) };
    }
    case 'current': {
      const t = add(m.current.pos, m.current.normal, INSPECT_LIFT);
      return { name: 'clamp', target: t, pos: add(t, unit([0.5, 0.65, 1]), 1.05) };
    }
    case 'temperature': {
      if (kit === 'industrial') {
        const t = add(irBarrel(rig.irBase, rig.irBarrelY), [0, 1, 0], INSPECT_LIFT - 0.05);
        return { name: 'temp', target: t, pos: add(t, unit([0.55, 0.45, 1]), 1.35) };
      }
      const t = add(m.temp.pos, [0, 1, 0], INSPECT_LIFT + 0.03);
      return { name: 'temp', target: t, pos: add(t, unit([0.45, 0.75, 1]), 1.25) };
    }
  }
}

let counter = 1_000_000;
/** camera shot for inspection mode; panelPx tells the director to frame the part right of the overlay */
export function inspectShot(id: HardwareId, asset: AssetId, kit: SensorKit): CameraShot {
  const f = inspectFrame(id, asset, kit);
  counter += 1;
  return { id: counter, name: f.name, pos: f.pos, target: f.target, panelPx: SUITE_PANEL_PX };
}
