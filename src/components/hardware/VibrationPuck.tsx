import { useMemo } from 'react';
import type { Mount } from '../../sim/mounts';
import type { V3 } from '../../sim/shots';
import { Cyl, Selectable, normalQuat } from './primitives';

const STEEL = '#c3c8cf';

/**
 * Potted stainless puck housing the vibration sensor (MPU6050 on the bench kit, ADXL345-class on the concept kit).
 * Stack along the mount normal: bonded mounting pad, magnet base (M6 stud inside), knurled body, top cap, rubber strain boot.
 * The braided conduit is drawn by the scene from the boot to the gland (see HARNESS.puck).
 */
export function VibrationPuck({ mount }: { mount: Mount }) {
  const q = useMemo(() => normalQuat(mount.normal), [mount.normal]);
  const ridges = useMemo(() => Array.from({ length: 28 }, (_, i) => (i / 28) * Math.PI * 2), []);
  const along = (d: number): V3 => [mount.pos[0] + mount.normal[0] * d, mount.pos[1] + mount.normal[1] * d, mount.pos[2] + mount.normal[2] * d];
  return (
    <Selectable id="vibration" center={along(0.19)} size={[0.3, 0.42, 0.3]}>
      <group position={mount.pos} quaternion={q}>
        {/* spot-faced mounting pad, partly sunk into the curved bearing cap */}
        <Cyl r={0.11} len={0.05} pos={[0, -0.005, 0]} color="#3f3f46" metal={0.6} rough={0.4} seg={32} />
        {/* M6 stud (visible as the thread ring between pad and magnet) */}
        <Cyl r={0.03} len={0.02} pos={[0, 0.03, 0]} color="#9ca3af" metal={0.9} rough={0.3} seg={16} cast={false} />
        {/* magnet base */}
        <Cyl r={0.098} len={0.05} pos={[0, 0.065, 0]} color="#202226" metal={0.4} rough={0.5} seg={36} />
        {/* knurled stainless body */}
        <Cyl r={0.082} len={0.17} pos={[0, 0.175, 0]} color={STEEL} metal={0.92} rough={0.28} seg={48} />
        {ridges.map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 0.084, 0.175, Math.sin(a) * 0.084]} rotation={[0, -a, 0]} castShadow={false}>
            <boxGeometry args={[0.008, 0.15, 0.01]} />
            <meshStandardMaterial color="#9aa1aa" metalness={0.9} roughness={0.35} />
          </mesh>
        ))}
        {/* top cap + connector */}
        <Cyl r={0.07} len={0.025} pos={[0, 0.272, 0]} color={STEEL} metal={0.92} rough={0.25} seg={36} />
        <Cyl r={0.032} len={0.03} pos={[0, 0.3, 0]} color="#9ca3af" metal={0.9} rough={0.3} seg={6} />
        {/* rubber strain boot */}
        <Cyl r={0.022} r2={0.036} len={0.07} pos={[0, 0.35, 0]} color="#111113" metal={0} rough={0.85} seg={20} />
      </group>
    </Selectable>
  );
}
