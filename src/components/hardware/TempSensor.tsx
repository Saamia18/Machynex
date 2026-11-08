import { useMemo } from 'react';
import * as THREE from 'three';
import type { Mount } from '../../sim/mounts';
import { IR_BRACKET_BASE, SHAFT_Y, irBarrel } from '../../sim/mounts';
import type { V3 } from '../../sim/shots';
import { Box, Cyl, Selectable } from './primitives';

const STEEL = '#c3c8cf';

/**
 * Bench kit: DS18B20 in a stainless sleeve held on top of the housing by a clamp band around the motor.
 * Lies along mount.axis on the fin tips; the cable leaves from the tail (HARNESS.tempProbe).
 */
export function TempProbe({ mount, bandRadius = 0.52 }: { mount: Mount; bandRadius?: number }) {
  const [x, y, z] = mount.pos;
  return (
    <Selectable id="temperature" center={[x, y + 0.03, z]} size={[0.42, 0.14, 0.16]}>
      <group>
        <mesh position={[x, SHAFT_Y, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
          <torusGeometry args={[bandRadius, 0.016, 8, 64]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.85} roughness={0.3} />
        </mesh>
        {/* band tensioner */}
        <Box size={[0.07, 0.05, 0.05]} pos={[x, SHAFT_Y + 0.05, bandRadius + 0.02]} color="#9ca3af" metal={0.85} rough={0.3} />
        {/* stainless sleeve + crimped tail */}
        <Cyl r={0.026} len={0.26} pos={[x - 0.02, y + 0.03, z]} axis="x" color={STEEL} metal={0.92} rough={0.25} seg={20} />
        <Cyl r={0.026} r2={0.026} len={0.01} pos={[x - 0.15, y + 0.03, z]} axis="x" color="#a1a1aa" metal={0.9} rough={0.3} seg={20} />
        <Cyl r={0.018} len={0.05} pos={[x + 0.135, y + 0.03, z]} axis="x" color="#e5e7eb" metal={0.3} rough={0.6} seg={16} />
      </group>
    </Selectable>
  );
}

/**
 * Concept kit: MLX90614 in an M12 stainless barrel on a 2-axis bracket (post + slotted arm), aimed at the drive-end stator.
 * The bracket stands on the base plate (static); no glow, no measurement cone.
 */
export function IrPod({ mount, base = IR_BRACKET_BASE, barrelY = 0.98 }: { mount: Mount; base?: V3; barrelY?: number }) {
  const barrel: V3 = irBarrel(base, barrelY);
  const q = useMemo(() => {
    const dir = new THREE.Vector3(mount.pos[0] - barrel[0], mount.pos[1] - barrel[1], mount.pos[2] - barrel[2]).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }, [mount.pos, base, barrelY]); // eslint-disable-line react-hooks/exhaustive-deps
  const postTop = barrelY - 0.12;
  return (
    <Selectable id="temperature" center={[barrel[0], (barrelY + 0.15) / 2, barrel[2] + 0.04]} size={[0.34, barrelY + 0.25, 0.36]}>
      <group>
        {/* foot plate + bolts */}
        <Box size={[0.18, 0.02, 0.18]} pos={[base[0], base[1] + 0.01, base[2]]} color="#52525b" metal={0.7} rough={0.4} />
        {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz], i) => <Cyl key={i} r={0.012} len={0.012} pos={[base[0] + sx * 0.065, base[1] + 0.026, base[2] + sz * 0.065]} color="#d4d4d8" metal={0.9} rough={0.3} seg={6} cast={false} />)}
        {/* square post */}
        <Box size={[0.04, postTop - base[1], 0.04]} pos={[base[0], (postTop + base[1]) / 2, base[2]]} color="#71717a" metal={0.7} rough={0.4} />
        {/* axis 1: swivel clamp on the post */}
        <Cyl r={0.035} len={0.06} pos={[base[0], postTop - 0.04, base[2]]} color="#3f3f46" metal={0.7} rough={0.4} seg={6} />
        {/* slotted arm to the barrel */}
        <Box size={[0.03, 0.03, 0.16]} pos={[base[0] - 0.025, postTop + 0.02, base[2] - 0.05]} rot={[0.35, 0, 0]} color="#71717a" metal={0.7} rough={0.4} />
        <Box size={[0.012, 0.032, 0.1]} pos={[base[0] - 0.025, postTop + 0.02, base[2] - 0.05]} rot={[0.35, 0, 0]} color="#18181b" metal={0} rough={1} cast={false} />
        {/* barrel, oriented toward the stator */}
        <group position={barrel} quaternion={q}>
          {/* axis 2: tilt knuckle */}
          <Cyl r={0.02} len={0.1} pos={[0, -0.02, 0]} axis="x" color="#3f3f46" metal={0.7} rough={0.4} seg={12} />
          <Cyl r={0.04} len={0.24} pos={[0, 0, 0]} color={STEEL} metal={0.92} rough={0.25} seg={28} />
          {Array.from({ length: 11 }, (_, i) => <Cyl key={i} r={0.043} len={0.006} pos={[0, -0.09 + i * 0.016, 0]} color="#a9afb7" metal={0.9} rough={0.3} seg={28} cast={false} />)}
          {/* M12 lock nuts */}
          {[-0.04, 0.06].map((yy) => <Cyl key={yy} r={0.055} len={0.02} pos={[0, yy, 0]} color="#9ca3af" metal={0.9} rough={0.3} seg={6} />)}
          {/* germanium-style lens window (dark, no glow) */}
          <Cyl r={0.03} len={0.006} pos={[0, 0.123, 0]} color="#1f2328" metal={0.6} rough={0.08} seg={24} cast={false} />
          {/* rear cable gland */}
          <Cyl r={0.02} r2={0.03} len={0.04} pos={[0, -0.14, 0]} color="#111113" metal={0} rough={0.8} seg={16} />
        </group>
      </group>
    </Selectable>
  );
}
