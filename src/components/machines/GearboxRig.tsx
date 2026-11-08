import { memo, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import type { Simulator } from '../../sim/engine';
import { ASSETS } from '../../sim/assets';
import { RIGS } from '../../sim/mounts';
import type { SensorKit } from '../../sim/mounts';
import { Box, Cable, Cyl, useBraidTexture } from '../hardware/primitives';
import { MachineHardware, useHeatMaterial, useMachineMotion } from './common';

// Concept asset: single-stage helical reducer driven by an induction motor. Procedural geometry only.
// Input shaft along X at y = RIG.shaftY, output shaft lower and parallel. Tooth counts are ASSUMED (assets.ts).

const RIG = RIGS['helical-gearbox'];
const YI = RIG.shaftY; // input shaft height
const YO = 0.45; // output shaft height
const HX0 = -0.45, HX1 = 0.85, HTOP = 1.25, HZ = 0.5; // housing extents
const GEAR = ASSETS['helical-gearbox'].gear!;
const OUT_RATIO = GEAR.pinionTeeth / GEAR.gearTeeth;

export const GearboxRig = memo(function GearboxRig({ sim, slowMo, kit, hostRef }: { sim: Simulator; slowMo: number; kit: SensorKit; hostRef: RefObject<THREE.Group> }) {
  const rotIn = useRef<THREE.Group>(null);
  const rotOut = useRef<THREE.Group>(null);
  const { mach } = useMachineMotion(sim, slowMo, [{ ref: rotIn, ratio: 1 }, { ref: rotOut, ratio: -OUT_RATIO }]);
  const housing = useHeatMaterial(sim, '#4b5563', { metalness: 0.5, roughness: 0.6 });
  const braid = useBraidTexture();
  const fins = useMemo(() => Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2), []);
  const hx = (HX0 + HX1) / 2, hw = HX1 - HX0, hh = HTOP - 0.04;
  const ribsX = [-0.32, -0.04, 0.3, 0.6];

  return (
    <group ref={mach}>
      <group ref={hostRef}>
        {/* drive motor on its cradle */}
        <Box size={[1.0, YI - 0.36 - 0.04, 0.7]} pos={[-1.8, 0.04 + (YI - 0.4) / 2, 0]} color="#3f3f46" metal={0.5} rough={0.5} />
        <Cyl r={0.36} len={1.2} pos={[-1.8, YI, 0]} axis="x" color="#334155" metal={0.6} rough={0.45} />
        {fins.map((a, i) => (
          <group key={i} position={[-1.8, YI, 0]} rotation={[a, 0, 0]}>
            <Box size={[1.05, 0.06, 0.02]} pos={[0, 0.38, 0]} color="#334155" metal={0.6} rough={0.45} />
          </group>
        ))}
        <Cyl r={0.38} len={0.22} pos={[-2.51, YI, 0]} axis="x" color="#1e293b" metal={0.5} rough={0.5} />
        <Box size={[0.26, 0.14, 0.24]} pos={[-1.9, YI + 0.41, 0]} color="#0a0a0a" metal={0.1} rough={0.8} />
        <Cable points={RIG.powerRoute} radius={0.026} color="#18181b" />

        {/* coupling guard */}
        <mesh position={[-0.85, YI, 0]}>
          <boxGeometry args={[0.6, 0.42, 0.42]} />
          <meshPhysicalMaterial color="#cbd5e1" transparent opacity={0.06} roughness={0.2} depthWrite={false} />
        </mesh>

        {/* ribbed cast housing (heat-mapped), horizontal split line, mounting feet */}
        <mesh position={[hx, 0.04 + hh / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[hw, hh, HZ * 2]} />
          <primitive object={housing} attach="material" />
        </mesh>
        {ribsX.flatMap((x) => [-1, 1].map((s) => (
          <mesh key={`${x}${s}`} position={[x, 0.04 + hh / 2, s * (HZ + 0.03)]} castShadow>
            <boxGeometry args={[0.05, hh - 0.08, 0.06]} />
            <primitive object={housing} attach="material" />
          </mesh>
        )))}
        <Box size={[hw + 0.06, 0.035, HZ * 2 + 0.06]} pos={[hx, 0.72, 0]} color="#27272a" metal={0.5} rough={0.5} />
        <Box size={[hw + 0.16, 0.06, HZ * 2 + 0.2]} pos={[hx, 0.07, 0]} color="#3f3f46" metal={0.55} rough={0.5} />
        {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz], i) => (
          <Cyl key={i} r={0.03} len={0.04} pos={[hx + sx * (hw / 2 + 0.03), 0.12, sz * (HZ + 0.06)]} color="#d4d4d8" metal={0.9} rough={0.3} seg={6} cast={false} />
        ))}

        {/* bearing bosses: input (high) and output (low, larger) */}
        <mesh position={[HX0 - 0.04, YI, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.18, 0.18, 0.1, 32]} />
          <primitive object={housing} attach="material" />
        </mesh>
        <mesh position={[HX1 + 0.05, YO, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.25, 0.25, 0.12, 36]} />
          <primitive object={housing} attach="material" />
        </mesh>

        {/* inspection cover with bolts, breather */}
        <Box size={[0.45, 0.025, 0.36]} pos={[0.35, HTOP + 0.012, -0.12]} color="#52525b" metal={0.6} rough={0.4} />
        {[[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]].map(([sx, sz], i) => (
          <Cyl key={i} r={0.016} len={0.02} pos={[0.35 + sx * 0.19, HTOP + 0.034, -0.12 + sz * 0.14]} color="#d4d4d8" metal={0.9} rough={0.3} seg={6} cast={false} />
        ))}
        <Cyl r={0.03} len={0.08} pos={[0.62, HTOP + 0.04, 0.25]} color="#9ca3af" metal={0.8} rough={0.3} seg={12} />
        <Cyl r={0.05} len={0.03} pos={[0.62, HTOP + 0.095, 0.25]} color="#9ca3af" metal={0.8} rough={0.3} seg={6} />

        {/* rotating: input shaft + coupling */}
        <group ref={rotIn} position={[0, YI, 0]}>
          <Cyl r={0.04} len={1.0} pos={[-0.95, 0, 0]} axis="x" color="#e5e7eb" metal={0.9} rough={0.25} />
          <Cyl r={0.11} len={0.1} pos={[-0.95, 0, 0]} axis="x" color="#71717a" metal={0.8} rough={0.3} />
          <Cyl r={0.11} len={0.1} pos={[-0.78, 0, 0]} axis="x" color="#71717a" metal={0.8} rough={0.3} />
          {[0, 1, 2, 3].map((i) => (
            <Cyl key={i} r={0.016} len={0.24} pos={[-0.865, Math.cos((i * Math.PI) / 2) * 0.07, Math.sin((i * Math.PI) / 2) * 0.07]} axis="x" color="#f97316" metal={0.3} rough={0.5} seg={8} cast={false} />
          ))}
        </group>
        {/* rotating: output shaft (slower by the assumed tooth ratio) + keyed hub */}
        <group ref={rotOut} position={[0, YO, 0]}>
          <Cyl r={0.07} len={0.6} pos={[HX1 + 0.35, 0, 0]} axis="x" color="#e5e7eb" metal={0.9} rough={0.25} />
          <Cyl r={0.18} len={0.12} pos={[HX1 + 0.55, 0, 0]} axis="x" color="#71717a" metal={0.8} rough={0.3} />
          <Box size={[0.12, 0.04, 0.05]} pos={[HX1 + 0.55, 0.17, 0]} color="#f97316" metal={0.3} rough={0.5} cast={false} />
        </group>
      </group>

      <MachineHardware rig={RIG} kit={kit} braid={braid} />
    </group>
  );
});
