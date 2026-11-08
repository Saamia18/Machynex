import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Simulator } from '../../sim/engine';
import type { RigLayout, SensorKit } from '../../sim/mounts';
import { HARNESS, HARNESS_BENCH_SIGNAL, ctRoute } from '../../sim/mounts';
import { Cable } from '../hardware/primitives';
import { VibrationPuck } from '../hardware/VibrationPuck';
import { CurrentSensor } from '../hardware/CurrentSensor';
import { TempProbe } from '../hardware/TempSensor';

// ------------------------------------------------------------------ thermal map (DECISIONS.md D12)
/** 0 below 45 C, 1 above 75 C, smooth in between */
export function heatK(tempC: number): number {
  const u = THREE.MathUtils.clamp((tempC - 45) / 30, 0, 1);
  return u * u * (3 - 2 * u);
}

const HEAT = {
  coolEm: new THREE.Color('#0d2a30'),
  amberEm: new THREE.Color('#d97706'),
  redEm: new THREE.Color('#dc2626'),
  hotBase: new THREE.Color('#5a2a1c'),
};

/** casing colour/emissive: slate/teal below 45 C, amber through the band, red above 75 C (shared material, so X-ray keeps it) */
export function applyHeat(mat: THREE.MeshStandardMaterial, base: THREE.Color, tempC: number, tmp: THREE.Color): void {
  const k = heatK(tempC);
  if (k < 0.55) tmp.copy(HEAT.coolEm).lerp(HEAT.amberEm, k / 0.55);
  else tmp.copy(HEAT.amberEm).lerp(HEAT.redEm, (k - 0.55) / 0.45);
  mat.emissive.copy(tmp);
  mat.emissiveIntensity = 0.2 + 1.8 * Math.pow(k, 1.5);
  mat.color.copy(base).lerp(HEAT.hotBase, k * 0.6);
}

/** one shared, heat-mapped casing material per machine; disposed on unmount (asset switch) */
export function useHeatMaterial(sim: Simulator, baseHex: string, opts: { metalness?: number; roughness?: number } = {}): THREE.MeshStandardMaterial {
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: baseHex, metalness: opts.metalness ?? 0.6, roughness: opts.roughness ?? 0.5, emissive: new THREE.Color('#0d2a30'), emissiveIntensity: 0.2 }),
    [baseHex, opts.metalness, opts.roughness],
  );
  const base = useMemo(() => new THREE.Color(baseHex), [baseHex]);
  const tmp = useMemo(() => new THREE.Color(), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => applyHeat(mat, base, sim.live.temp, tmp));
  return mat;
}

// ------------------------------------------------------------------ vibration + rotation
/**
 * Moves `mach` (the vibrating machine group) in proportion to the measured RMS velocity (whirl at the shaft angle plus
 * structural flutter, same law as the bench rig) and spins every group in `spinners` at its gear ratio.
 */
export function useMachineMotion(sim: Simulator, slowMo: number, spinners: { ref: React.RefObject<THREE.Group>; ratio: number }[]) {
  const mach = useRef<THREE.Group>(null);
  const angle = useRef(0);
  const slow = useRef(slowMo);
  slow.current = slowMo;
  useFrame((state, delta) => {
    const L = sim.live;
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    angle.current += (L.rpm / 60) * Math.PI * 2 * dt * slow.current;
    for (const s of spinners) if (s.ref.current) s.ref.current.rotation.x = angle.current * s.ratio;
    const vib = Math.min(L.vibMeas, 10);
    const run = L.rpm > 5 ? 1 : 0.4;
    const amp = (0.01 * vib + 0.0016 * vib * vib) * run;
    const flutter = Math.sin(t * 2 * Math.PI * 37) * 0.5 + (Math.random() - 0.5);
    if (mach.current) {
      mach.current.position.set(0, amp * Math.cos(angle.current) + amp * 0.35 * flutter, amp * Math.sin(angle.current) + amp * 0.35 * (Math.random() - 0.5) * 2);
      mach.current.rotation.z = 0.0035 * vib * (vib / 6) * flutter * run;
      mach.current.rotation.y = 0.0025 * vib * (vib / 6) * (Math.random() - 0.5) * 2 * run;
    }
  });
  return { mach, angle };
}

// ------------------------------------------------------------------ sensors snapped to the rig's tap points
/** Machynex sensor hardware that rides on the vibrating machine (puck, contact probe, current sensor) and their harnesses */
export function MachineHardware({ rig, kit, braid }: { rig: RigLayout; kit: SensorKit; braid: THREE.Texture }) {
  const m = rig.mounts;
  const ct = useMemo(() => ctRoute(m.current), [m.current]);
  return (
    <>
      <VibrationPuck mount={m.puck} />
      <Cable points={rig.puckRoute} radius={0.022} color="#ffffff" texture={braid} metal={0.6} rough={0.4} />
      {kit === 'bench' && (
        <>
          <TempProbe mount={m.temp} />
          <Cable points={HARNESS.tempProbe} radius={0.012} color="#d4d4d8" />
        </>
      )}
      <CurrentSensor mount={m.current} kit={kit} />
      {kit === 'bench'
        ? <Cable points={HARNESS_BENCH_SIGNAL} radius={0.011} color="#52525b" />
        : <Cable points={ct} radius={0.013} color="#111113" />}
    </>
  );
}
