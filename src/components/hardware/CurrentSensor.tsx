import { useMemo } from 'react';
import * as THREE from 'three';
import type { Mount, SensorKit } from '../../sim/mounts';
import { Box, Cyl, Selectable } from './primitives';

/** quaternion turning +X onto the mount axis (the direction the power lead runs) */
function axisQuat(axis: [number, number, number]): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(...axis).normalize());
}

/**
 * Bench kit: ACS712-type Hall module in line with the DC motor lead (optional channel, drawn translucent).
 * Concept kit: SCT-013 split-core CT clamped around ONE lead. A CT is AC only; on the DC bench rig the clamp is a labelled preview.
 * The lead itself is drawn by the scene and passes through the mount point along mount.axis.
 */
export function CurrentSensor({ mount, kit }: { mount: Mount; kit: SensorKit }) {
  const q = useMemo(() => axisQuat(mount.axis), [mount.axis]);
  return (
    <Selectable id="current" center={mount.pos} size={kit === 'industrial' ? [0.2, 0.26, 0.26] : [0.46, 0.18, 0.3]}>
      <group position={mount.pos} quaternion={q}>{kit === 'industrial' ? <CtClamp /> : <HallModule />}</group>
    </Selectable>
  );
}

function HallModule() {
  // local frame: +X along the lead, +Y up. The lead runs at local y = 0 through both screw terminals.
  const op = 0.75;
  return (
    <group>
      {/* PCB on four standoffs */}
      <Box size={[0.38, 0.016, 0.22]} pos={[0, -0.07, 0]} color="#9f1239" opacity={op} metal={0.1} rough={0.6} cast={false} />
      {[[-0.16, -0.09], [-0.16, 0.09], [0.16, -0.09], [0.16, 0.09]].map(([x, z], i) => (
        <Cyl key={i} r={0.01} len={0.04} pos={[x, -0.098, z]} color="#b08d57" metal={0.8} rough={0.35} seg={6} cast={false} />
      ))}
      {/* sensor IC (SOIC-8) */}
      <Box size={[0.06, 0.016, 0.045]} pos={[0.0, -0.054, -0.03]} color="#111" metal={0.1} rough={0.6} cast={false} />
      {/* two-way screw terminal the lead passes through */}
      <Box size={[0.08, 0.075, 0.12]} pos={[-0.13, -0.025, 0]} color="#1d4ed8" opacity={op} metal={0.05} rough={0.6} cast={false} />
      <Box size={[0.08, 0.075, 0.12]} pos={[0.13, -0.025, 0]} color="#1d4ed8" opacity={op} metal={0.05} rough={0.6} cast={false} />
      {[-0.13, 0.13].map((x) => <Cyl key={x} r={0.018} len={0.01} pos={[x, 0.018, 0]} color="#d4d4d8" metal={0.9} rough={0.3} seg={12} cast={false} />)}
      {/* 3-pin signal header (VCC, OUT, GND) */}
      {[-0.03, 0, 0.03].map((x) => <Box key={x} size={[0.012, 0.05, 0.012]} pos={[x + 0.05, -0.04, 0.09]} color="#d4d4d8" metal={0.9} rough={0.3} cast={false} />)}
    </group>
  );
}

function CtClamp() {
  // local frame: the lead runs along +X through the ring centre (ring plane = YZ)
  const ABS = '#1e3a8a';
  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      {/* two half housings, split along the hinge line */}
      <mesh rotation={[0, 0, 0]} castShadow>
        <torusGeometry args={[0.072, 0.032, 10, 32, Math.PI]} />
        <meshStandardMaterial color={ABS} roughness={0.55} metalness={0.05} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI]} castShadow>
        <torusGeometry args={[0.072, 0.032, 10, 32, Math.PI]} />
        <meshStandardMaterial color="#1e40af" roughness={0.55} metalness={0.05} />
      </mesh>
      {/* split-core ferrite visible in the bore */}
      <mesh>
        <torusGeometry args={[0.05, 0.01, 8, 32]} />
        <meshStandardMaterial color="#3a3a3c" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* hinge pin (one side) */}
      <Cyl r={0.012} len={0.075} pos={[0.105, 0, 0]} axis="z" color="#d4d4d8" metal={0.9} rough={0.3} seg={12} />
      {/* snap latch (other side) */}
      <Box size={[0.04, 0.05, 0.07]} pos={[-0.112, 0, 0]} color="#172554" metal={0.05} rough={0.6} />
      {/* output lead stub on the upper half */}
      <Cyl r={0.016} len={0.04} pos={[0, 0.115, 0]} color="#111113" metal={0} rough={0.8} seg={12} />
    </group>
  );
}
