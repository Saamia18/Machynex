import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Mount, SensorKit } from '../../sim/mounts';
import { Box, Cyl, Explode, Selectable, useCanvasTexture } from './primitives';

/** quaternion turning +X onto the mount axis (the direction the power lead runs) */
function axisQuat(axis: [number, number, number]): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(...axis).normalize());
}

/**
 * Bench kit: ACS712-type Hall module in line with the DC motor lead (optional channel: the board is drawn translucent).
 * Concept kit: SCT-013 split-core CT clamped around ONE lead. A CT is AC only; on the DC bench rig the clamp is a labelled preview.
 * The lead itself is drawn by the scene and passes through the mount point along mount.axis.
 */
export function CurrentSensor({ mount, kit }: { mount: Mount; kit: SensorKit }) {
  const q = useMemo(() => axisQuat(mount.axis), [mount.axis]);
  return (
    <Selectable id="current" center={mount.pos} size={kit === 'industrial' ? [0.2, 0.3, 0.3] : [0.46, 0.18, 0.3]} normal={mount.normal}>
      <group position={mount.pos} quaternion={q}>{kit === 'industrial' ? <CtClamp /> : <HallModule />}</group>
    </Selectable>
  );
}

const BRASS = '#b58a45';
const TERMINAL = '#2f7d3a';

/** green rising-cage terminal: body, wire entry on the outer face, brass screw with slot */
function Terminal({ x, outward }: { x: number; outward: 1 | -1 }) {
  return (
    <group position={[x, -0.025, 0]}>
      <Box size={[0.08, 0.075, 0.12]} pos={[0, 0, 0]} color={TERMINAL} metal={0.05} rough={0.62} cast={false} />
      {/* top ridge and the wire entry the lead passes through */}
      <Box size={[0.084, 0.008, 0.1]} pos={[0, 0.03, 0]} color="#276b31" metal={0.05} rough={0.6} cast={false} />
      <Box size={[0.002, 0.034, 0.034]} pos={[outward * 0.041, 0.025, 0]} color="#0a0d0a" metal={0} rough={1} cast={false} />
      <Box size={[0.002, 0.034, 0.034]} pos={[-outward * 0.041, 0.025, 0]} color="#0a0d0a" metal={0} rough={1} cast={false} />
      <Cyl r={0.019} len={0.012} pos={[0, 0.04, 0]} color={BRASS} metal={0.85} rough={0.3} seg={20} cast={false} />
      <Box size={[0.032, 0.004, 0.005]} pos={[0, 0.0465, 0]} color="#3b2f16" metal={0.3} rough={0.6} cast={false} />
    </group>
  );
}

function HallModule() {
  // local frame: +X along the lead, +Y up. The lead runs at local y = 0 through both screw terminals.
  const silk = useCanvasTexture(256, 160, (g) => {
    g.fillStyle = '#163c8c';
    g.fillRect(0, 0, 256, 160);
    g.strokeStyle = '#e5e7eb';
    g.fillStyle = '#e5e7eb';
    g.lineWidth = 2;
    g.strokeRect(6, 6, 244, 148);
    g.font = 'bold 15px monospace';
    g.fillText('ACS712ELC-05B', 64, 34);
    g.font = '13px monospace';
    g.fillText('IP+', 14, 92);
    g.fillText('IP-', 214, 92);
    g.fillText('VCC OUT GND', 120, 148);
    g.fillText('CT-01', 20, 148);
  }, []);
  return (
    <group>
      {/* translucent blue PCB (optional channel) on four brass standoffs */}
      <mesh position={[0, -0.07, 0]}>
        <boxGeometry args={[0.38, 0.016, 0.22]} />
        {[0, 1, 3, 4, 5].map((i) => <meshStandardMaterial key={i} attach={`material-${i}`} color="#163c8c" transparent opacity={0.75} metalness={0.1} roughness={0.6} />)}
        <meshStandardMaterial attach="material-2" map={silk} transparent opacity={0.75} metalness={0.1} roughness={0.55} />
      </mesh>
      {[[-0.16, -0.09], [-0.16, 0.09], [0.16, -0.09], [0.16, 0.09]].map(([x, z], i) => (
        <Cyl key={i} r={0.01} len={0.04} pos={[x, -0.098, z]} color={BRASS} metal={0.8} rough={0.35} seg={6} cast={false} />
      ))}
      {/* thick copper current path between the terminals (runs under the sensor IC) */}
      <Box size={[0.2, 0.005, 0.045]} pos={[0, -0.0595, -0.03]} color="#c27a3a" metal={0.85} rough={0.3} cast={false} />
      <Box size={[0.03, 0.005, 0.03]} pos={[-0.095, -0.0595, 0]} color="#c27a3a" metal={0.85} rough={0.3} cast={false} />
      <Box size={[0.03, 0.005, 0.03]} pos={[0.095, -0.0595, 0]} color="#c27a3a" metal={0.85} rough={0.3} cast={false} />
      {/* SOIC-8 Hall sensor IC with gull-wing leads (lifts off the copper path during inspection) */}
      <Explode offset={[0, 0.06, 0]}>
        <Box size={[0.05, 0.016, 0.036]} pos={[0, -0.05, -0.03]} color="#111" metal={0.1} rough={0.55} cast={false} />
        <Cyl r={0.003} len={0.001} pos={[-0.018, -0.0418, -0.042]} color="#3f3f46" metal={0} rough={0.9} seg={12} cast={false} />
        {[-0.019, -0.0063, 0.0063, 0.019].map((x) => [-1, 1].map((s) => (
          <Box key={`${x}${s}`} size={[0.006, 0.004, 0.012]} pos={[x, -0.0565, -0.03 + s * 0.022]} color="#c9ccd1" metal={0.9} rough={0.3} cast={false} />
        )))}
      </Explode>
      {/* filter capacitor, load resistor, SMD power LED */}
      <Box size={[0.014, 0.007, 0.008]} pos={[0.05, -0.0585, 0.035]} color="#a4865a" metal={0.2} rough={0.6} cast={false} />
      <Box size={[0.014, 0.005, 0.008]} pos={[0.08, -0.0595, 0.035]} color="#151515" metal={0.1} rough={0.6} cast={false} />
      <mesh position={[0.12, -0.0585, 0.06]}>
        <boxGeometry args={[0.012, 0.006, 0.008]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.2} />
      </mesh>
      {/* heavy-duty screw terminals the lead passes through */}
      <Explode offset={[0, 0.04, 0]}>
        <Terminal x={-0.13} outward={-1} />
        <Terminal x={0.13} outward={1} />
      </Explode>
      {/* 3-pin Dupont header (VCC, OUT, GND) */}
      <Explode offset={[0, 0.03, 0]}>
        <Box size={[0.08, 0.018, 0.022]} pos={[0.05, -0.053, 0.09]} color="#111113" metal={0.05} rough={0.7} cast={false} />
        {[0.02, 0.05, 0.08].map((x) => <Box key={x} size={[0.008, 0.05, 0.008]} pos={[x, -0.04, 0.09]} color="#d6b45a" metal={0.9} rough={0.3} cast={false} />)}
      </Explode>
    </group>
  );
}

/** one clamp half: rounded block with a semicircular bore notch, extruded along Z (bore axis) */
function useHalfGeometry(): THREE.ExtrudeGeometry {
  const geo = useMemo(() => {
    const w = 0.1, h = 0.1, r = 0.052, c = 0.022;
    const s = new THREE.Shape();
    s.moveTo(-w, 0);
    s.lineTo(-r, 0);
    s.absarc(0, 0, r, Math.PI, 0, true);
    s.lineTo(w, 0);
    s.lineTo(w, h - c);
    s.quadraticCurveTo(w, h, w - c, h);
    s.lineTo(-w + c, h);
    s.quadraticCurveTo(-w, h, -w, h - c);
    s.lineTo(-w, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 24 });
    g.translate(0, 0.006, -0.05); // the bevel grows the outline by 0.006: keep the split face on y = 0
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

/** split-face detail of one clamp half: laminated core face ringed by the copper secondary winding (seen when opened) */
function SplitFaces({ y, lam }: { y: number; lam: THREE.Texture }) {
  const up = y > 0; // lower half: its split face looks up
  return (
    <>
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * 0.076, y, 0]}>
          <Box size={[0.034, 0.002, 0.084]} pos={[0, 0, 0]} color="#b87333" metal={0.85} rough={0.3} cast={false} />
          <mesh position={[0, up ? 0.0012 : -0.0012, 0]} rotation={[up ? -Math.PI / 2 : Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.022, 0.07]} />
            <meshStandardMaterial map={lam} metalness={0.6} roughness={0.45} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function CtClamp() {
  // shape frame: bore axis = Z, split line on y = 0, hinge on +X, latch on -X. The group turns Z onto the lead (+X).
  const half = useHalfGeometry();
  const NYLON = '#2a4c9e';
  const lam = useCanvasTexture(64, 64, (g) => {
    g.fillStyle = '#4a4d52';
    g.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 4) { g.fillStyle = x % 8 ? '#6b6f75' : '#34373b'; g.fillRect(x, 0, 2, 64); }
  }, []);
  const label = useCanvasTexture(256, 64, (g) => {
    g.fillStyle = NYLON;
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#dbe3f3';
    g.font = 'bold 22px monospace';
    g.fillText('SCT-013-030', 40, 28);
    g.font = '18px monospace';
    g.fillText('30A : 1V   CT-01', 34, 54);
  }, []);
  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      {/* fixed lower half (with the winding) */}
      <mesh geometry={half} rotation={[0, 0, Math.PI]} castShadow>
        <meshStandardMaterial color={NYLON} roughness={0.78} metalness={0} />
      </mesh>
      <SplitFaces y={0.001} lam={lam} />
      {/* latch keeper on the lower half */}
      <Box size={[0.022, 0.05, 0.05]} pos={[-0.115, -0.03, 0]} color="#1f3a7a" metal={0.05} rough={0.7} />
      {/* hinge knuckles and pin */}
      <Cyl r={0.013} len={0.112} pos={[0.112, 0, 0]} axis="z" color="#1f3a7a" metal={0.05} rough={0.7} seg={16} />
      <Cyl r={0.005} len={0.118} pos={[0.112, 0, 0]} axis="z" color="#d4d4d8" metal={0.9} rough={0.3} seg={12} cast={false} />
      {/* upper half swings open about the hinge during inspection */}
      <Explode pivot={[0.112, 0, 0]} rot={[0, 0, -0.7]}>
        <mesh geometry={half} castShadow>
          <meshStandardMaterial color={NYLON} roughness={0.78} metalness={0} />
        </mesh>
        <SplitFaces y={-0.001} lam={lam} />
        {/* snap latch hook */}
        <Box size={[0.016, 0.04, 0.05]} pos={[-0.115, 0.012, 0]} color="#1f3a7a" metal={0.05} rough={0.7} />
        <Box size={[0.008, 0.012, 0.05]} pos={[-0.122, -0.012, 0]} color="#1f3a7a" metal={0.05} rough={0.7} cast={false} />
        {/* moulded label on the front face */}
        <mesh position={[0, 0.072, 0.0565]}>
          <planeGeometry args={[0.13, 0.032]} />
          <meshStandardMaterial map={label} roughness={0.8} metalness={0} />
        </mesh>
        {/* shielded twisted-pair output lead: boot, braid ring, jacket stub */}
        <Cyl r={0.019} r2={0.024} len={0.02} pos={[0, 0.112, 0]} color="#1f3a7a" metal={0.05} rough={0.7} seg={16} />
        <Cyl r={0.014} len={0.03} pos={[0, 0.135, 0]} color="#111113" metal={0} rough={0.8} seg={12} />
        <Cyl r={0.0145} len={0.004} pos={[0, 0.128, 0]} color="#6b7078" metal={0.7} rough={0.4} seg={12} cast={false} />
      </Explode>
    </group>
  );
}
