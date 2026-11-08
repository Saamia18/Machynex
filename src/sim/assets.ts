// Asset profiles: the same Machynex node and detection logic applied to different machines.
// ALL NUMBERS ARE ILLUSTRATIVE. Only `bench-dc` is in the proposal's scope; the others are concept assets with
// illustrative fault models that have not been validated against any real machine.
//
// The bench profile reproduces the engine's original behaviour exactly (vibFromMass, CONFIG thresholds and presets),
// so every pre-existing test runs unmodified against the default asset.

import { CONFIG as C } from './config';
import type { SensorKit } from './mounts';

export type AssetId = 'bench-dc' | 'induction-05hp' | 'slurry-pump' | 'helical-gearbox';
export const ASSET_IDS: AssetId[] = ['bench-dc', 'induction-05hp', 'slurry-pump', 'helical-gearbox'];

export const CONCEPT_ASSET_TAG = 'CONCEPT · illustrative fault model · not validated';

export interface Thresholds {
  vibWarn: number;
  vibCrit: number;
  zones: readonly number[]; // ISO 10816-3-style A/B/C/D bounds (illustrative)
  gaugeMax: number;
  tempWarn: number;
  tempCrit: number;
  tempCorroborate: number;
  curCrit: number;
  curCorroborate: number;
}

/** setpoints the fault model reads */
export interface FaultInputs { massG: number; severity: number }

export interface SpectrumPeak { f: number; amp: number; sigma: number }

export interface AssetProfile {
  id: AssetId;
  name: string;
  shortName: string;
  scope: 'proposal' | 'concept';
  machine: string;
  nominal: { rpm: number; current: number; temp: number };
  limits: { rpm: [number, number]; current: [number, number]; temp: [number, number] };
  th: Thresholds;
  faultName: string;
  /** 'mass' = eccentric-mass slider (unbalance); 'severity' = 0..1 fault severity slider */
  faultControl: 'mass' | 'severity';
  severityOf: (sp: FaultInputs) => number;
  /** true vibration (mm/s RMS) at the bearing tap for the fault inputs at a shaft speed */
  vib: (sp: FaultInputs, rpm: number) => number;
  currentDelta: (severity: number) => number;
  tempDelta: (severity: number) => number;
  spectrum: {
    maxHz: number;
    /** 'unbalance' = the original analytic 1X/2X/3X + rig resonance model (bench, induction) */
    model: 'unbalance' | 'cavitation' | 'pitting';
    floor?: (severity: number) => number;
    peaks?: (f1: number, severity: number) => SpectrumPeak[];
  };
  /** fault presets: progressive target (reaches EARLY, not CRITICAL) and the critical setpoints */
  presets: { progressiveTo: number; critical: { fault: number; currentA: number; tempC: number } };
  /** spin-down after a trip: rpm(t) = (R0 + c*tau) e^(-t/tau) - c*tau, tuned to stop in 2.5 s from nominal */
  coulombRpmPerS: number;
  sensorKit: SensorKit;
  conceptNote: string;
  gear?: { pinionTeeth: number; gearTeeth: number; note: string };
}

/** vibration severity (mm/s RMS) for an imbalance mass at a given speed (simple omega^2 model). Same as engine.vibFromMass. */
export function unbalanceVib(massG: number, rpm: number): number {
  const base = C.vib.floor + (massG - C.massMin) * C.vib.perGram;
  const k = rpm / C.nominalRpm;
  return Math.max(0, base) * k * k;
}

const massSeverity = (sp: FaultInputs) => Math.min(1, Math.max(0, (sp.massG - C.massMin) / (C.massMax - C.massMin)));

/** coulomb term that stops the shaft from `rpm` in `stopS` seconds with time constant `tau` */
export function coulombFor(rpm: number, tau: number = C.spinDownTau, stopS = 2.5): number {
  return rpm / (tau * (Math.exp(stopS / tau) - 1));
}

const BENCH: AssetProfile = {
  id: 'bench-dc',
  name: 'Bench rig · 12 V DC motor',
  shortName: 'Bench rig',
  scope: 'proposal',
  machine: '12 V DC (775-class) motor, shaft, pillow-block bearing and a disc with a controlled eccentric bolt',
  nominal: { rpm: C.nominalRpm, current: C.currentNominal, temp: C.tempNominal },
  limits: { rpm: [C.rpmMin, C.rpmMax], current: [C.currentMin, C.currentMax], temp: [C.tempMin, C.tempMax] },
  th: {
    vibWarn: C.vib.warn, vibCrit: C.vib.crit, zones: C.vib.zones, gaugeMax: C.vib.gaugeMax,
    tempWarn: C.temp.warn, tempCrit: C.temp.crit, tempCorroborate: C.temp.corroborate,
    curCrit: C.current.crit, curCorroborate: C.current.corroborate,
  },
  faultName: 'Rotor mass unbalance',
  faultControl: 'mass',
  severityOf: massSeverity,
  vib: (sp, rpm) => unbalanceVib(sp.massG, rpm),
  currentDelta: () => 0,
  tempDelta: () => 0,
  spectrum: { maxHz: C.fftMaxHz, model: 'unbalance' },
  presets: { progressiveTo: 0.65, critical: { fault: 1.1, currentA: 4.4, tempC: 82 } },
  coulombRpmPerS: coulombFor(C.nominalRpm),
  sensorKit: 'bench',
  conceptNote: '',
};

/** concept thresholds scaled from nominal (illustrative placeholders, not from any standard) */
function conceptThresholds(currentNominal: number, tempWarn: number, tempCrit: number, tempCorr: number): Thresholds {
  return {
    vibWarn: C.vib.warn, vibCrit: C.vib.crit, zones: C.vib.zones, gaugeMax: C.vib.gaugeMax,
    tempWarn, tempCrit, tempCorroborate: tempCorr,
    curCrit: Number((currentNominal * 1.5).toFixed(1)), curCorroborate: Number((currentNominal * 1.3).toFixed(1)),
  };
}

const INDUCTION: AssetProfile = {
  ...BENCH,
  id: 'induction-05hp',
  name: 'Induction motor · 0.5 HP (concept)',
  shortName: 'Induction motor',
  scope: 'concept',
  machine: '0.5 HP three-phase induction motor on the same frame (industrial scenario)',
  nominal: { rpm: 1450, current: 3.2, temp: 38 },
  limits: { rpm: [800, 1600], current: [0.5, 8], temp: [25, 100] },
  th: conceptThresholds(3.2, 55, 75, 46),
  presets: { progressiveTo: 0.65, critical: { fault: 1.1, currentA: 5.4, tempC: 82 } },
  coulombRpmPerS: coulombFor(1450),
  sensorKit: 'industrial',
  conceptNote: 'Same unbalance model as the bench rig, with AC-machine current levels. Measured with the industrial kit (SCT-013 clamp on one AC lead).',
};

const PUMP: AssetProfile = {
  id: 'slurry-pump',
  name: 'Centrifugal slurry pump (concept)',
  shortName: 'Slurry pump',
  scope: 'concept',
  machine: 'End-suction centrifugal pump with spiral volute, close-coupled to its motor',
  nominal: { rpm: 2900, current: 6.8, temp: 44 },
  limits: { rpm: [1500, 3300], current: [1, 12], temp: [25, 110] },
  th: conceptThresholds(6.8, 62, 80, 52),
  faultName: 'Impeller cavitation / dry-run starvation',
  faultControl: 'severity',
  severityOf: (sp) => sp.severity,
  vib: (sp, rpm) => (1.0 + 6.2 * sp.severity) * (rpm / 2900) ** 2,
  currentDelta: (s) => -1.6 * s, // fluid loss unloads the impeller: current FALLS
  tempDelta: (s) => 10 * s, // seal / casing heating when running starved
  spectrum: {
    maxHz: 200,
    model: 'cavitation',
    floor: (s) => 0.015 + 0.32 * s, // broadband floor rising with severity across the band
    peaks: (f1, s) => [
      { f: f1, amp: 0.65 + 0.2 * s, sigma: 0.9 },
      { f: 2 * f1, amp: 0.12 + 0.1 * s, sigma: 1.0 },
    ],
  },
  presets: { progressiveTo: 0.45, critical: { fault: 1.0, currentA: 6.8, tempC: 78 } },
  coulombRpmPerS: coulombFor(2900),
  sensorKit: 'industrial',
  conceptNote:
    'Illustrative cavitation model: a rising broadband floor and a modest current drop. Real cavitation energy extends well above the ~500 Hz bandwidth of the proposed MPU6050; concept — needs a wider-bandwidth sensor.',
};

const GEAR_PINION = 23;
const GEAR_WHEEL = 71;
const GEARBOX: AssetProfile = {
  id: 'helical-gearbox',
  name: 'Helical gearbox (concept)',
  shortName: 'Helical gearbox',
  scope: 'concept',
  machine: 'Single-stage helical reducer driven by an induction motor',
  nominal: { rpm: 980, current: 5.4, temp: 52 },
  limits: { rpm: [500, 1300], current: [1, 10], temp: [25, 110] },
  th: conceptThresholds(5.4, 70, 88, 60),
  faultName: 'Pinion tooth-flank pitting',
  faultControl: 'severity',
  severityOf: (sp) => sp.severity,
  vib: (sp, rpm) => (0.9 + 6.0 * Math.pow(Math.max(0, sp.severity), 1.1)) * (rpm / 980) ** 2,
  currentDelta: (s) => 0.5 * s,
  tempDelta: (s) => 14 * s,
  spectrum: {
    maxHz: 500, // GMF ≈ 376 Hz must be visible; still below the ~500 Hz Nyquist of a 1 kHz sensor
    model: 'pitting',
    floor: (s) => 0.015 + 0.03 * s,
    peaks: (f1, s) => {
      const gmf = GEAR_PINION * f1;
      return [
        { f: f1, amp: 0.35 + 0.1 * s, sigma: 1.0 },
        { f: gmf, amp: 0.4 + 2.2 * s, sigma: 1.6 },
        { f: gmf - f1, amp: 0.04 + 1.1 * s, sigma: 1.4 },
        { f: gmf + f1, amp: 0.04 + 1.1 * s, sigma: 1.4 },
        { f: gmf - 2 * f1, amp: 0.02 + 0.45 * s, sigma: 1.4 },
        { f: gmf + 2 * f1, amp: 0.02 + 0.45 * s, sigma: 1.4 },
      ];
    },
  },
  presets: { progressiveTo: 0.42, critical: { fault: 1.0, currentA: 5.4, tempC: 80 } },
  coulombRpmPerS: coulombFor(980),
  sensorKit: 'industrial',
  conceptNote: `Gear-mesh frequency = pinion teeth × shaft Hz. Tooth counts (${GEAR_PINION} pinion / ${GEAR_WHEEL} wheel) are ASSUMED illustrative values. Pitting grows the GMF peak and its 1X sidebands.`,
  gear: { pinionTeeth: GEAR_PINION, gearTeeth: GEAR_WHEEL, note: 'assumed tooth counts (illustrative)' },
};

export const ASSETS: Record<AssetId, AssetProfile> = {
  'bench-dc': BENCH,
  'induction-05hp': INDUCTION,
  'slurry-pump': PUMP,
  'helical-gearbox': GEARBOX,
};

export const DEFAULT_ASSET: AssetId = 'bench-dc';

/** gear-mesh frequency for an asset with gears at a shaft speed (Hz) */
export function gmfHz(p: AssetProfile, rpm: number): number | null {
  return p.gear ? (p.gear.pinionTeeth * rpm) / 60 : null;
}
