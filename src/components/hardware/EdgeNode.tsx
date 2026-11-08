import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Simulator } from '../../sim/engine';
import type { V3 } from '../../sim/shots';
import { GLANDS, GLAND_LEN, NODE } from '../../sim/mounts';
import type { SensorKit } from '../../sim/mounts';
import { Box, Cyl, Selectable, useCanvasTexture } from './primitives';

// Procedural IP65-style enclosure for the Machynex edge node (concept packaging: not in the proposed BOM).
// Hollow anodised-aluminium body, rubber gasket, tinted polycarbonate lid with hex fasteners, heatsink fins on the
// right end wall, three PG-style nylon glands on the rear wall, DC inlet on the left wall. Inside: PCB with traces,
// ESP32 module (shield can + antenna meander), status OLED, optocoupler across an isolation slot, cut-off element,
// screw terminals and three micro status LEDs.

const [CX, CY, CZ] = NODE.center;
const [SX, SY, SZ] = NODE.size;
const WALL = 0.035;
const BOT = CY - SY / 2; // -0.32 (floor)
const TOP = BOT + 0.4; // top of walls
const PCB_Y = BOT + 0.27; // high in the box so the board is visible over the front wall
const ALU = '#2b2e34';
const NYLON = '#1b1b1e';

function useSeededRandom(seed: number) {
  return useMemo(() => {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }, [seed]);
}

/** PG-style cable gland pointing -Z out of the rear wall: hex locknut, threaded body, dome cap, strain-relief cone */
function Gland({ at }: { at: V3 }) {
  const [x, y, z] = at;
  return (
    <group>
      <Cyl r={0.068} len={0.03} pos={[x, y, z - 0.015]} axis="z" color={NYLON} metal={0.05} rough={0.65} seg={6} />
      <Cyl r={0.05} len={0.05} pos={[x, y, z - 0.055]} axis="z" color={NYLON} metal={0.05} rough={0.6} seg={24} />
      {[0, 1, 2].map((i) => <Cyl key={i} r={0.054} len={0.006} pos={[x, y, z - 0.04 - i * 0.012]} axis="z" color="#26262a" metal={0.05} rough={0.6} seg={24} cast={false} />)}
      <Cyl r={0.058} len={0.045} pos={[x, y, z - 0.1]} axis="z" color={NYLON} metal={0.05} rough={0.55} seg={6} />
      <mesh position={[x, y, z - GLAND_LEN + 0.025]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.024, 0.045, 0.05, 20]} />
        <meshStandardMaterial color="#111113" roughness={0.8} metalness={0} />
      </mesh>
    </group>
  );
}

export interface NodeLeds {
  g: React.RefObject<THREE.MeshStandardMaterial>;
  a: React.RefObject<THREE.MeshStandardMaterial>;
  r: React.RefObject<THREE.MeshStandardMaterial>;
  relay: React.RefObject<THREE.MeshStandardMaterial>;
}

export const EdgeNode = memo(function EdgeNode({ sim, kit, xray, leds }: { sim: Simulator; kit: SensorKit; xray: boolean; leds: NodeLeds }) {
  const industrial = kit === 'industrial';
  const lid = useRef<THREE.Group>(null);
  const lidMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const micro = [useRef<THREE.MeshStandardMaterial>(null), useRef<THREE.MeshStandardMaterial>(null), useRef<THREE.MeshStandardMaterial>(null)];
  const xrayRef = useRef(xray);
  xrayRef.current = xray;
  const rand = useSeededRandom(42);

  // PCB artwork: matte black solder mask, routed traces, pads, silkscreen outline of the isolation barrier
  const pcbTex = useCanvasTexture(512, 256, (g) => {
    g.fillStyle = '#0d0f0e';
    g.fillRect(0, 0, 512, 256);
    g.lineCap = 'square';
    for (let i = 0; i < 70; i++) {
      let x = Math.floor(rand() * 32) * 16;
      let y = Math.floor(rand() * 16) * 16;
      g.strokeStyle = rand() > 0.25 ? '#36423a' : '#5a4a2c';
      g.lineWidth = rand() > 0.7 ? 4 : 2;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        if (k % 2 === 0) x += (Math.floor(rand() * 9) - 4) * 16; else y += (Math.floor(rand() * 7) - 3) * 16;
        g.lineTo(x, y);
      }
      g.stroke();
      g.fillStyle = '#a8894a';
      g.fillRect(x - 3, y - 3, 6, 6);
    }
    g.setLineDash([8, 6]);
    g.strokeStyle = '#d4d4d8';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(346, 6); g.lineTo(346, 250); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#d4d4d8';
    g.font = '15px monospace';
    g.fillText('3V3 LOGIC', 220, 244);
    g.fillText('ISOLATED', 360, 244);
    g.fillText('MNX-EDGE-01 REV A (CONCEPT)', 12, 20);
  }, [rand]);

  // shield can engraving
  const shieldTex = useCanvasTexture(256, 256, (g) => {
    g.fillStyle = '#c3c8cf';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#868c94';
    g.font = 'bold 26px monospace';
    g.fillText(industrial ? 'ESP32-S3' : 'ESP32', 22, 70);
    g.font = '20px monospace';
    g.fillText(industrial ? 'WROOM-1' : 'WROOM-32', 22, 104);
    g.fillText('2.4 GHz', 22, 138);
    g.strokeStyle = '#868c94';
    g.lineWidth = 3;
    g.strokeRect(10, 10, 236, 236);
  }, [industrial]);

  // 0.91" 128x32 monochrome OLED, redrawn at 4 Hz from the simulation
  const oled = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { c, g: c.getContext('2d'), t, acc: 1 };
  }, []);
  useEffect(() => () => oled.t.dispose(), [oled]);

  useFrame((state, delta) => {
    const L = sim.live;
    const t = state.clock.elapsedTime;
    // lid slides toward the front and clears in X-ray / open-enclosure mode
    if (lid.current) lid.current.position.z = THREE.MathUtils.damp(lid.current.position.z, xrayRef.current ? 0.62 : 0, 6, delta);
    if (lidMat.current) lidMat.current.opacity = THREE.MathUtils.damp(lidMat.current.opacity, xrayRef.current ? 0.04 : 0.16, 6, delta);
    // front panel + PCB status LEDs (existing behaviour: red blinks on CRITICAL)
    const st = L.state;
    const blink = Math.sin(t * 12) > 0;
    const lvl = [st === 'NORMAL' ? 2.4 : 0.08, st === 'EARLY' ? 2.4 : 0.08, st === 'CRITICAL' ? (blink ? 3 : 0.2) : 0.08];
    [leds.g, leds.a, leds.r].forEach((m, i) => { if (m.current) m.current.emissiveIntensity = lvl[i]; });
    micro.forEach((m, i) => { if (m.current) m.current.emissiveIntensity = lvl[i] * 0.8; });
    if (leds.relay.current) {
      leds.relay.current.color.set(L.relayClosed ? '#22c55e' : '#ef4444');
      leds.relay.current.emissive.set(L.relayClosed ? '#22c55e' : '#ef4444');
    }
    // OLED
    oled.acc += delta;
    if (oled.acc >= 0.25 && oled.g) {
      oled.acc = 0;
      const g = oled.g;
      g.fillStyle = '#000';
      g.fillRect(0, 0, 512, 128);
      g.fillStyle = '#e8eef2';
      g.font = 'bold 30px monospace';
      const name = st === 'NORMAL' ? 'NORMAL' : st === 'EARLY' ? 'EARLY WARN' : 'CRITICAL';
      g.fillText('MNX-EDGE-01     SIM', 10, 34);
      g.fillText(`${name.padEnd(10)} ${L.vibMeas.toFixed(2)}mm/s`, 10, 76);
      g.fillText(`CUT ${L.relayClosed ? 'ON ' : 'OFF'}  tick 50ms`, 10, 118);
      oled.t.needsUpdate = true;
    }
  });

  const finZ = useMemo(() => Array.from({ length: 9 }, (_, i) => CZ - SZ / 2 + 0.08 + i * ((SZ - 0.16) / 8)), []);
  const lx = CX - SX / 2, rx = CX + SX / 2, fz = CZ + SZ / 2, bz = CZ - SZ / 2;

  return (
    <Selectable id="node" center={[CX, CY + 0.04, CZ]} size={[SX + 0.2, SY + 0.12, SZ + 0.12]}>
      <group>
        {/* hollow body: floor + four walls */}
        <Box size={[SX, WALL, SZ]} pos={[CX, BOT + WALL / 2, CZ]} color={ALU} metal={0.75} rough={0.45} />
        <Box size={[SX, 0.4, WALL]} pos={[CX, BOT + 0.2, fz - WALL / 2]} color={ALU} metal={0.75} rough={0.45} />
        <Box size={[SX, 0.4, WALL]} pos={[CX, BOT + 0.2, bz + WALL / 2]} color={ALU} metal={0.75} rough={0.45} />
        <Box size={[WALL, 0.4, SZ]} pos={[lx + WALL / 2, BOT + 0.2, CZ]} color={ALU} metal={0.75} rough={0.45} />
        <Box size={[WALL, 0.4, SZ]} pos={[rx - WALL / 2, BOT + 0.2, CZ]} color={ALU} metal={0.75} rough={0.45} />
        {/* rubber gasket seam */}
        {/* (a perimeter strip on the wall tops, not a slab: the interior stays visible) */}
        {[
          { size: [SX + 0.012, 0.014, WALL + 0.012] as V3, pos: [CX, TOP + 0.007, fz - WALL / 2] as V3 },
          { size: [SX + 0.012, 0.014, WALL + 0.012] as V3, pos: [CX, TOP + 0.007, bz + WALL / 2] as V3 },
          { size: [WALL + 0.012, 0.014, SZ + 0.012] as V3, pos: [lx + WALL / 2, TOP + 0.007, CZ] as V3 },
          { size: [WALL + 0.012, 0.014, SZ + 0.012] as V3, pos: [rx - WALL / 2, TOP + 0.007, CZ] as V3 },
        ].map((g, i) => <Box key={i} size={g.size} pos={g.pos} color="#08080a" metal={0} rough={0.95} cast={false} />)}
        {/* heatsink fins on the right end wall */}
        {finZ.map((z) => <Box key={z} size={[0.09, 0.32, 0.018]} pos={[rx + 0.045, BOT + 0.2, z]} color={ALU} metal={0.75} rough={0.4} />)}
        {/* DC inlet on the left wall (12 V adapter) */}
        <Cyl r={0.05} len={0.06} pos={[lx - 0.03, -0.12, 2.36]} axis="x" color="#3f3f46" metal={0.6} rough={0.4} seg={24} />
        {/* front panel indicator LEDs */}
        {[{ x: -0.35, ref: leds.g, col: '#22c55e' }, { x: 0.0, ref: leds.a, col: '#f59e0b' }, { x: 0.35, ref: leds.r, col: '#ef4444' }].map((l, i) => (
          <group key={i} position={[CX + l.x, BOT + 0.22, fz]}>
            <Cyl r={0.06} len={0.02} pos={[0, 0, 0.01]} axis="z" color="#18181b" cast={false} />
            <mesh position={[0, 0, 0.03]}>
              <sphereGeometry args={[0.04, 16, 12]} />
              <meshStandardMaterial ref={l.ref} color={l.col} emissive={l.col} emissiveIntensity={0.1} />
            </mesh>
          </group>
        ))}
        {/* glands on the rear wall */}
        {GLANDS.map((g, i) => <Gland key={i} at={g} />)}

        {/* ---- interior ---- */}
        {[[-0.64, -0.26], [-0.64, 0.26], [0.64, -0.26], [0.64, 0.26]].map(([dx, dz], i) => (
          <Cyl key={i} r={0.016} len={PCB_Y - BOT - WALL} pos={[CX + dx, (PCB_Y + BOT + WALL) / 2, CZ + dz]} color="#b08d57" metal={0.8} rough={0.35} seg={6} cast={false} />
        ))}
        <mesh position={[CX + 0.0, PCB_Y, CZ]} receiveShadow>
          <boxGeometry args={[1.42, 0.025, 0.64]} />
          <meshStandardMaterial attach="material-0" color="#0d0f0e" roughness={0.9} />
          <meshStandardMaterial attach="material-1" color="#0d0f0e" roughness={0.9} />
          <meshStandardMaterial attach="material-2" map={pcbTex} roughness={0.85} metalness={0.05} />
          <meshStandardMaterial attach="material-3" color="#0d0f0e" roughness={0.9} />
          <meshStandardMaterial attach="material-4" color="#0d0f0e" roughness={0.9} />
          <meshStandardMaterial attach="material-5" color="#0d0f0e" roughness={0.9} />
        </mesh>

        {/* ESP32 module: carrier, shield can (engraved), antenna meander */}
        <group position={[CX - 0.42, PCB_Y + 0.02, CZ - 0.02]}>
          <Box size={[0.32, 0.014, 0.46]} pos={[0, 0, 0]} color="#101820" metal={0.1} rough={0.7} cast={false} />
          <mesh position={[0, 0.03, -0.06]} castShadow>
            <boxGeometry args={[0.28, 0.045, 0.3]} />
            <meshStandardMaterial attach="material-0" color="#b9bec5" metalness={0.9} roughness={0.32} />
            <meshStandardMaterial attach="material-1" color="#b9bec5" metalness={0.9} roughness={0.32} />
            <meshStandardMaterial attach="material-2" map={shieldTex} metalness={0.85} roughness={0.35} />
            <meshStandardMaterial attach="material-3" color="#b9bec5" metalness={0.9} roughness={0.32} />
            <meshStandardMaterial attach="material-4" color="#b9bec5" metalness={0.9} roughness={0.32} />
            <meshStandardMaterial attach="material-5" color="#b9bec5" metalness={0.9} roughness={0.32} />
          </mesh>
          {/* printed antenna meander */}
          {Array.from({ length: 6 }, (_, i) => (
            <Box key={i} size={[0.012, 0.004, 0.07]} pos={[-0.1 + i * 0.04, 0.009, 0.16]} color="#b08d57" metal={0.8} rough={0.4} cast={false} />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <Box key={i} size={[0.052, 0.004, 0.012]} pos={[-0.08 + i * 0.04, 0.009, i % 2 ? 0.13 : 0.19]} color="#b08d57" metal={0.8} rough={0.4} cast={false} />
          ))}
        </group>

        {/* 0.91" status OLED */}
        <group position={[CX + 0.0, PCB_Y + 0.03, CZ - 0.12]}>
          <Box size={[0.32, 0.012, 0.13]} pos={[0, 0, 0]} color="#0b1b33" metal={0.1} rough={0.7} cast={false} />
          <mesh position={[0, 0.009, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.26, 0.065]} />
            <meshBasicMaterial map={oled.t} toneMapped={false} />
          </mesh>
        </group>

        {/* micro status LEDs */}
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[CX - 0.05 + i * 0.05, PCB_Y + 0.02, CZ + 0.05]}>
            <boxGeometry args={[0.025, 0.012, 0.016]} />
            <meshStandardMaterial ref={micro[i]} color={['#22c55e', '#f59e0b', '#ef4444'][i]} emissive={['#22c55e', '#f59e0b', '#ef4444'][i]} emissiveIntensity={0.1} />
          </mesh>
        ))}

        {/* isolation slot + optocoupler straddling it */}
        <Box size={[0.02, 0.028, 0.5]} pos={[CX + 0.27, PCB_Y + 0.002, CZ - 0.02]} color="#020203" metal={0} rough={1} cast={false} />
        <Box size={[0.08, 0.035, 0.06]} pos={[CX + 0.27, PCB_Y + 0.03, CZ - 0.05]} color="#111" metal={0.1} rough={0.6} cast={false} />
        {[-1, 1].map((s) => [-1, 1].map((k) => (
          <Box key={`${s}${k}`} size={[0.008, 0.02, 0.008]} pos={[CX + 0.27 + s * 0.045, PCB_Y + 0.018, CZ - 0.05 + k * 0.018]} color="#c9ccd1" metal={0.9} rough={0.3} cast={false} />
        )))}

        {/* cut-off element: DC-rated MOSFET switch (bench) or AC solid-state relay (AC concept) */}
        {industrial ? (
          <group position={[CX + 0.52, PCB_Y + 0.055, CZ - 0.03]}>
            <Box size={[0.26, 0.09, 0.2]} pos={[0, 0, 0]} color="#16181c" metal={0.1} rough={0.55} />
            <Box size={[0.24, 0.006, 0.18]} pos={[0, 0.048, 0]} color="#e4e4e7" metal={0} rough={0.8} cast={false} />
            {[-1, 1].map((s) => [-1, 1].map((k) => <Cyl key={`${s}${k}`} r={0.018} len={0.012} pos={[s * 0.09, 0.055, k * 0.06]} color="#d4d4d8" metal={0.9} rough={0.3} seg={12} cast={false} />))}
          </group>
        ) : (
          <group position={[CX + 0.5, PCB_Y + 0.03, CZ - 0.05]}>
            {/* TO-220 MOSFET lying on a small heat-spreader pad */}
            <Box size={[0.16, 0.006, 0.2]} pos={[0, -0.01, 0]} color="#a8894a" metal={0.8} rough={0.35} cast={false} />
            <Box size={[0.1, 0.03, 0.12]} pos={[0, 0.008, 0.02]} color="#0a0a0a" metal={0.1} rough={0.6} />
            <Box size={[0.1, 0.008, 0.06]} pos={[0, 0.0, -0.07]} color="#c9ccd1" metal={0.9} rough={0.3} cast={false} />
            {[-0.03, 0, 0.03].map((x) => <Box key={x} size={[0.008, 0.006, 0.06]} pos={[x, -0.004, 0.11]} color="#c9ccd1" metal={0.9} rough={0.3} cast={false} />)}
          </group>
        )}
        {/* cut-off state LED */}
        <mesh position={[CX + 0.37, PCB_Y + 0.02, CZ + 0.18]}>
          <sphereGeometry args={[0.018, 12, 10]} />
          <meshStandardMaterial ref={leds.relay} color="#22c55e" emissive="#22c55e" emissiveIntensity={2} />
        </mesh>

        {/* screw terminals at the rear: sensor side (green) and switched/power side (orange) */}
        {[{ x: CX - 0.35, n: 3, col: '#15803d' }, { x: CX + 0.2, n: 2, col: '#c2410c' }, { x: CX + 0.6, n: 3, col: '#15803d' }].map((tb, i) => (
          <group key={i} position={[tb.x, PCB_Y + 0.045, bz + 0.12]}>
            <Box size={[0.07 * tb.n, 0.065, 0.08]} pos={[0, 0, 0]} color={tb.col} metal={0.05} rough={0.6} cast={false} />
            {Array.from({ length: tb.n }, (_, k) => (
              <Cyl key={k} r={0.016} len={0.01} pos={[(k - (tb.n - 1) / 2) * 0.07, 0.036, 0.01]} color="#d4d4d8" metal={0.9} rough={0.3} seg={12} cast={false} />
            ))}
          </group>
        ))}

        {/* tinted polycarbonate lid with hex fasteners (slides open in X-ray) */}
        <group ref={lid}>
          <mesh position={[CX, TOP + 0.034, CZ]}>
            <boxGeometry args={[SX, 0.04, SZ]} />
            <meshPhysicalMaterial ref={lidMat} color="#64748b" transparent opacity={0.16} roughness={0.25} metalness={0} envMapIntensity={0.25} depthWrite={false} />
          </mesh>
          {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz], i) => (
            <Cyl key={i} r={0.028} len={0.02} pos={[CX + sx * (SX / 2 - 0.06), TOP + 0.064, CZ + sz * (SZ / 2 - 0.06)]} color="#a1a1aa" metal={0.9} rough={0.3} seg={6} />
          ))}
        </group>
      </group>
    </Selectable>
  );
});
