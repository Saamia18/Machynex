import { memo, useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import type { Simulator } from '../../sim/engine';
import { RIGS } from '../../sim/mounts';
import type { SensorKit } from '../../sim/mounts';
import { Box, Cable, Cyl, useBraidTexture } from '../hardware/primitives';
import { MachineHardware, useHeatMaterial, useMachineMotion } from './common';

// Concept asset: end-suction centrifugal slurry pump close-coupled to its motor. Procedural geometry only.
// Shaft axis along X at y = RIG.shaftY. Casing (volute) centred at x = 0.45.

const RIG = RIGS['slurry-pump'];
const Y = RIG.shaftY;
const CX = 0.45; // casing centre

/** spiral volute: a tube along a one-turn spiral around the shaft axis whose radius grows toward the discharge */
function useVoluteGeometry(): THREE.BufferGeometry {
  const geo = useMemo(() => {
    const turns = 96;
    const R = (u: number) => 0.36 + 0.14 * u;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= turns; i++) {
      const u = i / turns;
      const th = -Math.PI / 2 + u * 2 * Math.PI;
      pts.push(new THREE.Vector3(CX, Y + R(u) * Math.cos(th), R(u) * Math.sin(th)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const segs = 96, radial = 18;
    const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
    // scale each ring about its centre: tube radius grows 0.05 -> 0.16 along the spiral
    const pos = g.attributes.position as THREE.BufferAttribute;
    const c = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      curve.getPointAt(u, c);
      const r = 0.05 + 0.11 * u;
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
        pos.setXYZ(k, v.x, v.y, v.z);
      }
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

function Flange({ x, y, z, r, axis = 'x', bolts = 8 }: { x: number; y: number; z: number; r: number; axis?: 'x' | 'y'; bolts?: number }) {
  const ring = useMemo(() => Array.from({ length: bolts }, (_, i) => (i / bolts) * Math.PI * 2), [bolts]);
  return (
    <group>
      <Cyl r={r} len={0.05} pos={[x, y, z]} axis={axis} color="#3f3f46" metal={0.7} rough={0.4} seg={32} />
      {ring.map((a, i) => {
        const p: [number, number, number] = axis === 'x' ? [x, y + Math.cos(a) * r * 0.8, z + Math.sin(a) * r * 0.8] : [x + Math.cos(a) * r * 0.8, y, z + Math.sin(a) * r * 0.8];
        return <Cyl key={i} r={0.018} len={0.07} pos={p} axis={axis} color="#d4d4d8" metal={0.9} rough={0.3} seg={6} cast={false} />;
      })}
    </group>
  );
}

export const PumpRig = memo(function PumpRig({ sim, slowMo, kit, hostRef }: { sim: Simulator; slowMo: number; kit: SensorKit; hostRef: RefObject<THREE.Group> }) {
  const rot = useRef<THREE.Group>(null);
  const { mach } = useMachineMotion(sim, slowMo, [{ ref: rot, ratio: 1 }]);
  const casing = useHeatMaterial(sim, '#4b5563', { metalness: 0.55, roughness: 0.55 });
  const volute = useVoluteGeometry();
  const braid = useBraidTexture();
  const fins = useMemo(() => Array.from({ length: 18 }, (_, i) => (i / 18) * Math.PI * 2), []);

  return (
    <group ref={mach}>
      <group ref={hostRef}>
        {/* drive motor (TEFC) on its cradle */}
        <Box size={[1.0, Y - 0.36 - 0.04, 0.7]} pos={[-1.6, 0.04 + (Y - 0.4) / 2, 0]} color="#3f3f46" metal={0.5} rough={0.5} />
        <Cyl r={0.36} len={1.2} pos={[-1.6, Y, 0]} axis="x" color="#334155" metal={0.6} rough={0.45} />
        {fins.map((a, i) => (
          <group key={i} position={[-1.6, Y, 0]} rotation={[a, 0, 0]}>
            <Box size={[1.05, 0.06, 0.02]} pos={[0, 0.38, 0]} color="#334155" metal={0.6} rough={0.45} />
          </group>
        ))}
        <Cyl r={0.38} len={0.22} pos={[-2.31, Y, 0]} axis="x" color="#1e293b" metal={0.5} rough={0.5} />
        <Box size={[0.26, 0.14, 0.24]} pos={[-1.8, Y + 0.4, 0]} color="#0a0a0a" metal={0.1} rough={0.8} />
        <Cable points={RIG.powerRoute} radius={0.026} color="#18181b" />

        {/* coupling guard (open frame so the spinning coupling stays visible) */}
        <mesh position={[-0.8, Y, 0]}>
          <boxGeometry args={[0.4, 0.42, 0.42]} />
          <meshPhysicalMaterial color="#cbd5e1" transparent opacity={0.06} roughness={0.2} depthWrite={false} />
        </mesh>

        {/* bearing frame (power end) + foot */}
        <Cyl r={0.2} len={0.7} pos={[-0.25, Y, 0]} axis="x" color="#52525b" metal={0.6} rough={0.45} seg={36} />
        <Box size={[0.5, Y - 0.2 - 0.04, 0.26]} pos={[-0.25, 0.04 + (Y - 0.24) / 2, 0]} color="#3f3f46" metal={0.55} rough={0.5} />
        <Box size={[0.7, 0.05, 0.6]} pos={[-0.25, 0.065, 0]} color="#3f3f46" metal={0.6} rough={0.45} />

        {/* seal housing (stuffing box) between frame and casing */}
        <Cyl r={0.12} len={0.22} pos={[0.2, Y, 0]} axis="x" color="#52525b" metal={0.6} rough={0.4} seg={28} />

        {/* casing: back cover, impeller chamber, spiral volute (heat-mapped) */}
        <mesh position={[CX - 0.17, Y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.36, 0.36, 0.06, 40]} />
          <primitive object={casing} attach="material" />
        </mesh>
        <mesh position={[CX, Y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.4, 0.4, 0.28, 48]} />
          <primitive object={casing} attach="material" />
        </mesh>
        <mesh geometry={volute} castShadow receiveShadow>
          <primitive object={casing} attach="material" />
        </mesh>
        {/* discharge: rises from the end of the volute */}
        <mesh position={[CX, Y + 0.48, -0.5]} castShadow>
          <cylinderGeometry args={[0.13, 0.15, 0.96, 28]} />
          <primitive object={casing} attach="material" />
        </mesh>
        <Flange x={CX} y={Y + 0.98} z={-0.5} r={0.22} axis="y" />
        {/* suction: axial pipe into the eye of the impeller */}
        <Flange x={CX + 0.17} y={Y} z={0} r={0.21} />
        <Cyl r={0.14} len={0.8} pos={[CX + 0.58, Y, 0]} axis="x" color="#6b7280" metal={0.6} rough={0.45} seg={28} />
        <Flange x={CX + 0.98} y={Y} z={0} r={0.22} />
        {/* pipe support */}
        <Box size={[0.12, Y - 0.15 - 0.04, 0.2]} pos={[CX + 0.78, 0.04 + (Y - 0.19) / 2, 0]} color="#3f3f46" metal={0.55} rough={0.5} />
        {/* casing pedestal */}
        <Box size={[0.32, 0.16, 0.5]} pos={[CX, 0.12, 0]} color="#3f3f46" metal={0.55} rough={0.5} />

        {/* rotating: shaft and flexible coupling */}
        <group ref={rot} position={[0, Y, 0]}>
          <Cyl r={0.04} len={1.4} pos={[-0.35, 0, 0]} axis="x" color="#e5e7eb" metal={0.9} rough={0.25} />
          <Cyl r={0.11} len={0.1} pos={[-0.88, 0, 0]} axis="x" color="#71717a" metal={0.8} rough={0.3} />
          <Cyl r={0.11} len={0.1} pos={[-0.72, 0, 0]} axis="x" color="#71717a" metal={0.8} rough={0.3} />
          {[0, 1, 2, 3].map((i) => (
            <Cyl key={i} r={0.016} len={0.26} pos={[-0.8, Math.cos((i * Math.PI) / 2) * 0.07, Math.sin((i * Math.PI) / 2) * 0.07]} axis="x" color="#f97316" metal={0.3} rough={0.5} seg={8} cast={false} />
          ))}
        </group>
      </group>

      <MachineHardware rig={RIG} kit={kit} braid={braid} />
    </group>
  );
});
