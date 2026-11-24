import { useMemo } from 'react';
import * as THREE from 'three';
import type { Mount } from '../../sim/mounts';
import { IR_BRACKET_BASE, SHAFT_Y, irBarrel } from '../../sim/mounts';
import type { V3 } from '../../sim/shots';
import { Box, Cyl, Explode, HexNut, Selectable, useBrushedTexture, useCanvasTexture } from './primitives';

const STEEL = '#c3c8cf';
const ALU = '#9aa0a8';

/**
 * Bench kit: DS18B20 in a stainless tube, crimped onto a black PVC cable under a heat-shrink sleeve, clipped into a
 * stainless thermal saddle that rides on a slotted worm-drive hose clamp around the motor housing.
 * The probe lies along X on top of the housing; the cable leaves from the tail (HARNESS.tempProbe).
 */
export function TempProbe({ mount, bandRadius = 0.52 }: { mount: Mount; bandRadius?: number }) {
  const [x, y, z] = mount.pos;
  const brushed = useBrushedTexture();
  // perforated hose-clamp band: dark slots on stainless, repeated around the circumference
  const slots = useCanvasTexture(64, 32, (g) => {
    g.fillStyle = '#b9bec6';
    g.fillRect(0, 0, 64, 32);
    g.fillStyle = '#6b7078';
    g.fillRect(22, 11, 20, 10);
  }, []);
  useMemo(() => {
    slots.wrapS = THREE.RepeatWrapping;
    slots.repeat.set(56, 1);
    slots.needsUpdate = true;
  }, [slots]);
  const py = y + 0.056; // probe axis height (sits in the saddle above the band)
  return (
    <Selectable id="temperature" center={[x, y + 0.05, z]} size={[0.42, 0.16, 0.16]}>
      <group>
        {/* slotted hose-clamp band around the housing */}
        <mesh position={[x, SHAFT_Y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[bandRadius, bandRadius, 0.028, 96, 1, true]} />
          <meshStandardMaterial map={slots} metalness={0.85} roughness={0.35} side={THREE.DoubleSide} />
        </mesh>
        {/* worm-drive housing and hex screw on the side of the band */}
        <group position={[x, SHAFT_Y + 0.05, bandRadius + 0.024]}>
          <Box size={[0.05, 0.05, 0.036]} pos={[0, 0, 0]} color="#c3c8cf" metal={0.85} rough={0.32} />
          <Cyl r={0.011} len={0.09} pos={[0, 0.01, 0.006]} color="#9ca3af" metal={0.9} rough={0.3} seg={12} cast={false} />
          <HexNut pos={[0, 0.06, 0.006]} r={0.019} h={0.016} />
          <Box size={[0.003, 0.004, 0.028]} pos={[0, 0.069, 0.006]} color="#3f3f46" cast={false} />
        </group>
        {/* thermal saddle: curved pad riveted to the band, two side lips and spring clips over the probe */}
        <Box size={[0.22, 0.012, 0.08]} pos={[x - 0.02, y + 0.026, z]} color="#b4bac2" metal={0.85} rough={0.32} />
        {[-1, 1].map((s) => <Box key={s} size={[0.22, 0.036, 0.006]} pos={[x - 0.02, y + 0.048, z + s * 0.031]} color="#b4bac2" metal={0.85} rough={0.32} cast={false} />)}
        {[-0.1, 0.06].map((dx) => <Cyl key={dx} r={0.008} len={0.004} pos={[x + dx, y + 0.034, z]} color="#e5e7eb" metal={0.9} rough={0.28} seg={12} cast={false} />)}

        {/* probe assembly lifts out of the saddle during inspection */}
        <Explode offset={[0, 0.06, 0]}>
          {[-0.08, 0.02].map((dx) => (
            <mesh key={dx} position={[x + dx, py, z]} rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[0.027, 0.003, 6, 20, Math.PI]} />
              <meshStandardMaterial color="#d1d5db" metalness={0.9} roughness={0.28} />
            </mesh>
          ))}
          {/* stainless tube with a rounded tip */}
          <Cyl r={0.021} len={0.18} pos={[x - 0.06, py, z]} axis="x" color={STEEL} metal={0.92} rough={0.26} seg={24} roughMap={brushed} />
          <mesh position={[x - 0.15, py, z]}>
            <sphereGeometry args={[0.021, 20, 12]} />
            <meshStandardMaterial color={STEEL} metalness={0.92} roughness={0.26} />
          </mesh>
          {/* two crimp rings onto the cable */}
          {[0.035, 0.05].map((dx) => <Cyl key={dx} r={0.0185} len={0.008} pos={[x + dx, py, z]} axis="x" color="#a1a1aa" metal={0.9} rough={0.32} seg={24} cast={false} />)}
          {/* heat-shrink sleeve tapering onto the black PVC cable */}
          <Cyl r={0.023} len={0.08} pos={[x + 0.095, py, z]} axis="x" color="#111113" metal={0} rough={0.75} seg={20} />
          <Cyl r={0.013} r2={0.023} len={0.03} pos={[x + 0.15, py, z]} axis="x" color="#111113" metal={0} rough={0.75} seg={20} />
        </Explode>
      </group>
    </Selectable>
  );
}

/**
 * Concept kit: MLX90614 in an M12 threaded stainless barrel with two hex lock nuts and a recessed IR window, held by a
 * dual-axis slotted aluminium bracket (swivel on the post, tilt knuckle on the arm), aimed at the drive-end stator.
 * The bracket stands on the base plate (static); no glow, no measurement cone.
 */
export function IrPod({ mount, base = IR_BRACKET_BASE, barrelY = 0.98 }: { mount: Mount; base?: V3; barrelY?: number }) {
  const barrel: V3 = irBarrel(base, barrelY);
  const q = useMemo(() => {
    const dir = new THREE.Vector3(mount.pos[0] - barrel[0], mount.pos[1] - barrel[1], mount.pos[2] - barrel[2]).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }, [mount.pos, base, barrelY]); // eslint-disable-line react-hooks/exhaustive-deps
  const brushed = useBrushedTexture();
  const etch = useCanvasTexture(128, 32, (g) => {
    g.fillStyle = '#c3c8cf';
    g.fillRect(0, 0, 128, 32);
    g.fillStyle = '#4b5058';
    g.font = 'bold 16px monospace';
    g.fillText('TP-01 MLX', 14, 22);
  }, []);
  const postTop = barrelY - 0.12;
  return (
    <Selectable id="temperature" center={[barrel[0], (barrelY + 0.15) / 2, barrel[2] + 0.04]} size={[0.34, barrelY + 0.25, 0.36]}>
      <group>
        {/* foot plate + socket bolts */}
        <Box size={[0.18, 0.02, 0.18]} pos={[base[0], base[1] + 0.01, base[2]]} color={ALU} metal={0.7} rough={0.42} />
        {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz], i) => <Cyl key={i} r={0.012} len={0.012} pos={[base[0] + sx * 0.065, base[1] + 0.026, base[2] + sz * 0.065]} color="#d4d4d8" metal={0.9} rough={0.3} seg={6} cast={false} />)}
        {/* extruded square post with a slot down its face */}
        <Box size={[0.04, postTop - base[1], 0.04]} pos={[base[0], (postTop + base[1]) / 2, base[2]]} color={ALU} metal={0.7} rough={0.4} />
        <Box size={[0.012, postTop - base[1] - 0.08, 0.002]} pos={[base[0], (postTop + base[1]) / 2, base[2] + 0.021]} color="#202226" metal={0} rough={1} cast={false} />
        {/* axis 1: swivel clamp on the post, with a slotted arc plate and wing screw */}
        <Cyl r={0.035} len={0.06} pos={[base[0], postTop - 0.04, base[2]]} color="#71767e" metal={0.75} rough={0.38} seg={6} />
        <Box size={[0.006, 0.07, 0.07]} pos={[base[0] - 0.03, postTop - 0.02, base[2]]} color={ALU} metal={0.7} rough={0.4} />
        <Box size={[0.002, 0.012, 0.05]} pos={[base[0] - 0.0335, postTop - 0.005, base[2]]} color="#202226" metal={0} rough={1} cast={false} />
        <Cyl r={0.01} len={0.03} pos={[base[0] - 0.045, postTop - 0.005, base[2]]} axis="x" color="#d4d4d8" metal={0.9} rough={0.3} seg={6} cast={false} />
        {/* axis 2: slotted arm to the tilt knuckle */}
        <Box size={[0.03, 0.03, 0.16]} pos={[base[0] - 0.025, postTop + 0.02, base[2] - 0.05]} rot={[0.35, 0, 0]} color={ALU} metal={0.7} rough={0.4} />
        <Box size={[0.012, 0.032, 0.1]} pos={[base[0] - 0.025, postTop + 0.02, base[2] - 0.05]} rot={[0.35, 0, 0]} color="#18181b" metal={0} rough={1} cast={false} />
        {/* barrel, oriented toward the stator */}
        <group position={barrel} quaternion={q}>
          <Cyl r={0.02} len={0.1} pos={[0, -0.02, 0]} axis="x" color="#71767e" metal={0.75} rough={0.38} seg={12} />
          <Cyl r={0.026} len={0.11} pos={[0, -0.02, 0]} axis="x" color="#2b2e33" metal={0.3} rough={0.6} seg={6} cast={false} />
          {/* the barrel slides forward along its optical axis during inspection; the front nut backs off further */}
          <Explode offset={[0, 0.06, 0]}>
            <Cyl r={0.04} len={0.24} pos={[0, 0, 0]} color={STEEL} metal={0.92} rough={0.26} seg={32} roughMap={brushed} />
            {/* M12 thread crests */}
            {Array.from({ length: 13 }, (_, i) => <Cyl key={i} r={0.0425} len={0.005} pos={[0, -0.1 + i * 0.015, 0]} color="#a9afb7" metal={0.9} rough={0.3} seg={32} cast={false} />)}
            {/* etched band */}
            <mesh position={[0, -0.02, 0]}>
              <cylinderGeometry args={[0.0405, 0.0405, 0.026, 32, 1, true]} />
              <meshStandardMaterial map={etch} metalness={0.75} roughness={0.35} />
            </mesh>
            <HexNut pos={[0, -0.045, 0]} r={0.056} h={0.02} />
            <Explode offset={[0, 0.03, 0]}>
              <HexNut pos={[0, 0.065, 0]} r={0.056} h={0.02} />
            </Explode>
            {/* recessed IR window: front lip, dark inner wall, germanium-style lens set back from the face */}
            <mesh position={[0, 0.1205, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.029, 0.04, 32]} />
              <meshStandardMaterial color="#d1d5db" metalness={0.9} roughness={0.25} />
            </mesh>
            <Cyl r={0.029} len={0.014} pos={[0, 0.113, 0]} color="#16181b" metal={0.3} rough={0.7} seg={24} open cast={false} />
            <Cyl r={0.027} len={0.003} pos={[0, 0.107, 0]} color="#2a2633" metal={0.6} rough={0.06} seg={24} cast={false} />
            {/* rear cable gland */}
            <Cyl r={0.02} r2={0.03} len={0.04} pos={[0, -0.14, 0]} color="#111113" metal={0} rough={0.8} seg={16} />
          </Explode>
        </group>
      </group>
    </Selectable>
  );
}
