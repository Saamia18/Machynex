import { memo, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { Simulator } from '../../sim/engine';
import type { V3 } from '../../sim/shots';
import { GLANDS, GLAND_LEN, NODE } from '../../sim/mounts';
import type { SensorKit } from '../../sim/mounts';
import { Box, Cyl, Explode, ExplodeContext, Selectable, SocketScrew, useCanvasTexture } from './primitives';

// Procedural IP65-style enclosure for the Machynex edge node (concept packaging: not in the proposed BOM).
// Hollow die-cast aluminium body with chamfered walls and corner screw bosses, rubber gasket, tinted polycarbonate lid
// held by four M4 socket-head cap screws, extruded heat-sink fins on the right end wall, three PG7-style nylon glands with
// hex lock nuts on the rear wall, DC inlet on the left wall, recessed status LEDs on the front.
// Inside: matte-black PCB with ENIG (gold) pads and traces, ESP32 module (engraved RF shield, castellated pads, printed
// antenna), 0.91" OLED on a pin header, optocoupler across a milled isolation slot, the cut-off element, green
// rising-cage terminal blocks with brass screws, SMD passives and three micro status LEDs.
// During inspection the lid lifts off and the board assembly rises out of the box.

const [CX, CY, CZ] = NODE.center;
const [SX, SY, SZ] = NODE.size;
const WALL = 0.035;
const BOT = CY - SY / 2; // -0.32 (floor)
const TOP = BOT + 0.4; // top of walls
const PCB_Y = BOT + 0.27; // high in the box so the board is visible over the front wall
const ALU = '#3a3e45';
const NYLON = '#1b1b1e';
const BRASS = '#b58a45';
const BOSS: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const bossAt = (sx: number, sz: number): [number, number] => [CX + sx * (SX / 2 - 0.05), CZ + sz * (SZ / 2 - 0.05)];

function useSeededRandom(seed: number) {
  return useMemo(() => {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }, [seed]);
}

/** die-cast wall: box with chamfered (rounded) edges */
function Wall({ size, pos }: { size: V3; pos: V3 }) {
  return (
    <RoundedBox args={size} radius={0.012} smoothness={2} position={pos} castShadow receiveShadow>
      <meshStandardMaterial color={ALU} metalness={0.78} roughness={0.42} />
    </RoundedBox>
  );
}

/** PG7-style cable gland pointing -Z out of the rear wall: hex lock nut, threaded body, dome cap, strain-relief cone */
function Gland({ at }: { at: V3 }) {
  const [x, y, z] = at;
  return (
    <group>
      {/* inner lock nut, visible inside the box */}
      <Cyl r={0.062} len={0.02} pos={[x, y, z + WALL + 0.01]} axis="z" color={NYLON} metal={0.05} rough={0.6} seg={6} cast={false} />
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

/** tinted polycarbonate lid with four M4 socket-head screws: slides forward in X-ray, lifts off during inspection */
function Lid({ xrayRef }: { xrayRef: MutableRefObject<boolean> }) {
  const k = useContext(ExplodeContext);
  const lid = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshPhysicalMaterial>(null);
  useFrame((_, delta) => {
    const open = xrayRef.current || k.current > 0.3;
    if (lid.current) lid.current.position.z = THREE.MathUtils.damp(lid.current.position.z, xrayRef.current ? 0.62 : 0, 6, delta);
    if (mat.current) mat.current.opacity = THREE.MathUtils.damp(mat.current.opacity, open ? 0.05 : 0.16, 6, delta);
  });
  return (
    <Explode offset={[0, 0.08, 0]}>
      <group ref={lid}>
        <mesh position={[CX, TOP + 0.034, CZ]}>
          <boxGeometry args={[SX, 0.04, SZ]} />
          <meshPhysicalMaterial ref={mat} color="#64748b" transparent opacity={0.16} roughness={0.25} metalness={0} envMapIntensity={0.25} depthWrite={false} />
        </mesh>
        {BOSS.map(([sx, sz], i) => {
          const [x, z] = bossAt(sx, sz);
          return <SocketScrew key={i} pos={[x, TOP + 0.065, z]} r={0.026} h={0.022} />;
        })}
      </group>
    </Explode>
  );
}

interface EdgeNodeProps {
  sim: Simulator;
  kit: SensorKit;
  xray: boolean;
  leds: NodeLeds;
  /** the host machine runs on AC: only then may the cut-off be an AC solid-state relay (a DC rig gets a DC-rated switch) */
  acMachine?: boolean;
}

export const EdgeNode = memo(function EdgeNode({ sim, kit, xray, leds, acMachine = false }: EdgeNodeProps) {
  const industrial = kit === 'industrial';
  const acRelay = industrial && acMachine;
  const micro = [useRef<THREE.MeshStandardMaterial>(null), useRef<THREE.MeshStandardMaterial>(null), useRef<THREE.MeshStandardMaterial>(null)];
  const xrayRef = useRef(xray);
  xrayRef.current = xray;
  const rand = useSeededRandom(42);

  // PCB artwork: matte black solder mask, ENIG gold traces and pads, silkscreen labels and the isolation-barrier outline
  const pcbTex = useCanvasTexture(1024, 512, (g) => {
    g.fillStyle = '#0c0d0d';
    g.fillRect(0, 0, 1024, 512);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let i = 0; i < 110; i++) {
      let x = Math.floor(rand() * 64) * 16;
      let y = Math.floor(rand() * 32) * 16;
      g.strokeStyle = rand() > 0.3 ? '#5e4d24' : '#8a6d2c';
      g.lineWidth = rand() > 0.75 ? 7 : 3;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        if (k % 2 === 0) x += (Math.floor(rand() * 9) - 4) * 16; else y += (Math.floor(rand() * 7) - 3) * 16;
        g.lineTo(x, y);
      }
      g.stroke();
      g.fillStyle = '#d9b04f';
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0c0d0d';
      g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill();
    }
    // isolation barrier: dashed outline and keep-out hatch
    g.setLineDash([16, 12]);
    g.strokeStyle = '#e4e4e7';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(692, 12); g.lineTo(692, 500); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#e4e4e7';
    g.font = '26px monospace';
    g.fillText('3V3 LOGIC', 470, 490);
    g.fillText('ISOLATED', 720, 490);
    g.fillText('MNX-EDGE-01 REV A  (CONCEPT)', 22, 40);
    g.font = '20px monospace';
    g.fillText('U1 ESP32', 60, 470);
    g.fillText('DS1 OLED', 400, 140);
    g.fillText('U3 OPTO', 560, 300);
    g.fillText(acRelay ? 'K1 SSR (AC)' : 'Q1 DC SWITCH', 820, 300);
    g.fillText('J1 SENS', 130, 90);
    g.fillText('J2 PWR', 520, 90);
    g.fillText('J3 SENS', 860, 90);
    // fiducials
    g.fillStyle = '#d9b04f';
    [[30, 470], [990, 40]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); });
  }, [rand, acRelay]);

  // RF shield laser etching
  const shieldTex = useCanvasTexture(256, 256, (g) => {
    g.fillStyle = '#c3c8cf';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#7d838b';
    g.font = 'bold 26px monospace';
    g.fillText(industrial ? 'ESP32-S3' : 'ESP32', 22, 64);
    g.font = '20px monospace';
    g.fillText(industrial ? 'WROOM-1' : 'WROOM-32', 22, 98);
    g.fillText('2.4 GHz WLAN', 22, 132);
    g.font = '15px monospace';
    g.fillText('CONCEPT SIM UNIT', 22, 200);
    g.strokeStyle = '#7d838b';
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

  // SMD passives along the free strip at the front of the board (capacitors tan, resistors black)
  const caps = useRef<THREE.InstancedMesh>(null);
  const res = useRef<THREE.InstancedMesh>(null);
  const smd = useMemo(() => {
    const out: { x: number; z: number; rot: number; cap: boolean }[] = [];
    for (let i = 0; i < 26; i++) {
      const row = Math.floor(i / 13);
      const x = CX - 0.62 + (i % 13) * 0.1 + row * 0.04;
      const z = CZ + 0.17 + row * 0.08;
      if (Math.abs(x - (CX + 0.37)) < 0.06 && Math.abs(z - (CZ + 0.18)) < 0.06) continue; // cut-off LED
      if (x > CX - 0.6 && x < CX - 0.24 && z < CZ + 0.22) continue; // printed antenna keep-out
      if (Math.abs(x - (CX + 0.27)) < 0.03 && z < CZ + 0.23) continue; // isolation slot
      out.push({ x, z, rot: i % 3 === 0 ? Math.PI / 2 : 0, cap: i % 2 === 0 });
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    let ci = 0, ri = 0;
    for (const p of smd) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
      m.compose(new THREE.Vector3(p.x, PCB_Y + 0.0165, p.z), q, one);
      if (p.cap) caps.current?.setMatrixAt(ci++, m); else res.current?.setMatrixAt(ri++, m);
    }
    if (caps.current) { caps.current.count = ci; caps.current.instanceMatrix.needsUpdate = true; }
    if (res.current) { res.current.count = ri; res.current.instanceMatrix.needsUpdate = true; }
  }, [smd]);

  useFrame((state, delta) => {
    const L = sim.live;
    const t = state.clock.elapsedTime;
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

  const finZ = useMemo(() => Array.from({ length: 13 }, (_, i) => CZ - SZ / 2 + 0.07 + i * ((SZ - 0.14) / 12)), []);
  const lx = CX - SX / 2, rx = CX + SX / 2, fz = CZ + SZ / 2, bz = CZ - SZ / 2;

  return (
    <Selectable id="node" center={[CX, CY + 0.04, CZ]} size={[SX + 0.2, SY + 0.12, SZ + 0.12]}>
      <group>
        {/* hollow die-cast body: floor + four chamfered walls */}
        <Box size={[SX - 0.01, WALL, SZ - 0.01]} pos={[CX, BOT + WALL / 2, CZ]} color={ALU} metal={0.78} rough={0.42} />
        <Wall size={[SX, 0.4, WALL]} pos={[CX, BOT + 0.2, fz - WALL / 2]} />
        <Wall size={[SX, 0.4, WALL]} pos={[CX, BOT + 0.2, bz + WALL / 2]} />
        <Wall size={[WALL, 0.4, SZ]} pos={[lx + WALL / 2, BOT + 0.2, CZ]} />
        <Wall size={[WALL, 0.4, SZ]} pos={[rx - WALL / 2, BOT + 0.2, CZ]} />
        {/* corner screw bosses cast into the body */}
        {BOSS.map(([sx, sz], i) => {
          const [x, z] = bossAt(sx, sz);
          return <Cyl key={i} r={0.032} len={0.4 - WALL} pos={[x, BOT + WALL + (0.4 - WALL) / 2, z]} color={ALU} metal={0.78} rough={0.42} seg={20} cast={false} />;
        })}
        {/* rubber gasket seam: a perimeter strip on the wall tops, not a slab, so the interior stays visible */}
        {[
          { size: [SX + 0.012, 0.014, WALL + 0.012] as V3, pos: [CX, TOP + 0.007, fz - WALL / 2] as V3 },
          { size: [SX + 0.012, 0.014, WALL + 0.012] as V3, pos: [CX, TOP + 0.007, bz + WALL / 2] as V3 },
          { size: [WALL + 0.012, 0.014, SZ + 0.012] as V3, pos: [lx + WALL / 2, TOP + 0.007, CZ] as V3 },
          { size: [WALL + 0.012, 0.014, SZ + 0.012] as V3, pos: [rx - WALL / 2, TOP + 0.007, CZ] as V3 },
        ].map((g, i) => <Box key={i} size={g.size} pos={g.pos} color="#08080a" metal={0} rough={0.95} cast={false} />)}
        {/* extruded heat-sink fins on the right end wall */}
        {finZ.map((z) => (
          <RoundedBox key={z} args={[0.1, 0.34, 0.016]} radius={0.006} smoothness={2} position={[rx + 0.05, BOT + 0.2, z]} castShadow>
            <meshStandardMaterial color={ALU} metalness={0.8} roughness={0.38} />
          </RoundedBox>
        ))}
        {/* DC inlet on the left wall (12 V adapter): barrel jack bezel and hex nut */}
        <Cyl r={0.05} len={0.06} pos={[lx - 0.03, -0.12, 2.36]} axis="x" color="#3f3f46" metal={0.6} rough={0.4} seg={24} />
        <Cyl r={0.06} len={0.012} pos={[lx - 0.004, -0.12, 2.36]} axis="x" color="#a1a1aa" metal={0.9} rough={0.3} seg={6} cast={false} />
        {/* front panel: recessed status LEDs in light-pipe bezels */}
        {[{ x: -0.35, ref: leds.g, col: '#22c55e' }, { x: 0.0, ref: leds.a, col: '#f59e0b' }, { x: 0.35, ref: leds.r, col: '#ef4444' }].map((l, i) => (
          <group key={i} position={[CX + l.x, BOT + 0.22, fz]}>
            <Cyl r={0.036} len={0.008} pos={[0, 0, 0.002]} axis="z" color="#121214" metal={0.2} rough={0.6} cast={false} />
            <mesh position={[0, 0, 0.0]}>
              <sphereGeometry args={[0.022, 16, 12]} />
              <meshStandardMaterial ref={l.ref} color={l.col} emissive={l.col} emissiveIntensity={0.1} />
            </mesh>
          </group>
        ))}
        {/* glands on the rear wall */}
        {GLANDS.map((g, i) => <Gland key={i} at={g} />)}

        {/* ---- interior ---- */}
        {[[-0.64, -0.26], [-0.64, 0.26], [0.64, -0.26], [0.64, 0.26]].map(([dx, dz], i) => (
          <Cyl key={i} r={0.016} len={PCB_Y - BOT - WALL} pos={[CX + dx, (PCB_Y + BOT + WALL) / 2, CZ + dz]} color={BRASS} metal={0.8} rough={0.35} seg={6} cast={false} />
        ))}

        {/* board assembly: rises out of the box during inspection */}
        <Explode offset={[0, 0.05, 0]}>
          <mesh position={[CX, PCB_Y, CZ]} receiveShadow>
            <boxGeometry args={[1.42, 0.025, 0.64]} />
            {[0, 1, 3, 4, 5].map((i) => <meshStandardMaterial key={i} attach={`material-${i}`} color="#0c0d0d" roughness={0.9} />)}
            <meshStandardMaterial attach="material-2" map={pcbTex} roughness={0.82} metalness={0.08} />
          </mesh>
          {/* board screws into the standoffs */}
          {[[-0.64, -0.26], [-0.64, 0.26], [0.64, -0.26], [0.64, 0.26]].map(([dx, dz], i) => (
            <Cyl key={i} r={0.02} len={0.008} pos={[CX + dx, PCB_Y + 0.016, CZ + dz]} color="#d4d4d8" metal={0.9} rough={0.3} seg={16} cast={false} />
          ))}

          {/* ESP32 module: carrier, castellated edge pads, engraved RF shield, printed antenna meander */}
          <group position={[CX - 0.42, PCB_Y + 0.02, CZ - 0.02]}>
            <Box size={[0.32, 0.014, 0.46]} pos={[0, 0, 0]} color="#101820" metal={0.1} rough={0.7} cast={false} />
            {Array.from({ length: 9 }, (_, i) => [-1, 1].map((s) => (
              <Box key={`${i}${s}`} size={[0.012, 0.016, 0.018]} pos={[s * 0.16, 0, -0.2 + i * 0.03]} color="#d9b04f" metal={0.9} rough={0.3} cast={false} />
            )))}
            <mesh position={[0, 0.03, -0.06]} castShadow>
              <boxGeometry args={[0.28, 0.045, 0.3]} />
              {[0, 1, 3, 4, 5].map((i) => <meshStandardMaterial key={i} attach={`material-${i}`} color="#b9bec5" metalness={0.9} roughness={0.32} />)}
              <meshStandardMaterial attach="material-2" map={shieldTex} metalness={0.85} roughness={0.35} />
            </mesh>
            {Array.from({ length: 6 }, (_, i) => (
              <Box key={i} size={[0.012, 0.004, 0.07]} pos={[-0.1 + i * 0.04, 0.009, 0.16]} color="#d9b04f" metal={0.85} rough={0.35} cast={false} />
            ))}
            {Array.from({ length: 5 }, (_, i) => (
              <Box key={i} size={[0.052, 0.004, 0.012]} pos={[-0.08 + i * 0.04, 0.009, i % 2 ? 0.13 : 0.19]} color="#d9b04f" metal={0.85} rough={0.35} cast={false} />
            ))}
          </group>

          {/* 0.91" status OLED module on a 4-pin header and plastic spacer */}
          <group position={[CX, PCB_Y + 0.012, CZ - 0.12]}>
            <Box size={[0.1, 0.018, 0.022]} pos={[0, 0.009, -0.055]} color="#111113" metal={0.05} rough={0.7} cast={false} />
            {[-0.036, -0.012, 0.012, 0.036].map((x) => <Box key={x} size={[0.007, 0.05, 0.007]} pos={[x, 0.025, -0.055]} color="#d6b45a" metal={0.9} rough={0.3} cast={false} />)}
            <group position={[0, 0.05, 0]}>
              <Box size={[0.32, 0.012, 0.13]} pos={[0, 0, 0]} color="#0b1b33" metal={0.1} rough={0.7} cast={false} />
              <Box size={[0.28, 0.006, 0.08]} pos={[0, 0.008, 0.008]} color="#0a0a0c" metal={0.2} rough={0.3} cast={false} />
              <mesh position={[0, 0.0115, 0.008]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[0.26, 0.065]} />
                <meshBasicMaterial map={oled.t} toneMapped={false} />
              </mesh>
            </group>
          </group>

          {/* micro status LEDs */}
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[CX - 0.05 + i * 0.05, PCB_Y + 0.02, CZ + 0.05]}>
              <boxGeometry args={[0.025, 0.012, 0.016]} />
              <meshStandardMaterial ref={micro[i]} color={['#22c55e', '#f59e0b', '#ef4444'][i]} emissive={['#22c55e', '#f59e0b', '#ef4444'][i]} emissiveIntensity={0.1} />
            </mesh>
          ))}

          {/* milled isolation slot + 4-pin optocoupler straddling it (pin-1 dot) */}
          <Box size={[0.02, 0.028, 0.5]} pos={[CX + 0.27, PCB_Y + 0.002, CZ - 0.02]} color="#020203" metal={0} rough={1} cast={false} />
          <Box size={[0.08, 0.035, 0.06]} pos={[CX + 0.27, PCB_Y + 0.03, CZ - 0.05]} color="#111" metal={0.1} rough={0.6} cast={false} />
          <Cyl r={0.006} len={0.002} pos={[CX + 0.245, PCB_Y + 0.048, CZ - 0.07]} color="#3f3f46" metal={0} rough={0.9} seg={12} cast={false} />
          {[-1, 1].map((s) => [-1, 1].map((k) => (
            <Box key={`${s}${k}`} size={[0.008, 0.02, 0.008]} pos={[CX + 0.27 + s * 0.045, PCB_Y + 0.018, CZ - 0.05 + k * 0.018]} color="#c9ccd1" metal={0.9} rough={0.3} cast={false} />
          )))}

          {/* cut-off element: DC-rated MOSFET switch on a DC rig, AC solid-state relay only on an AC concept machine */}
          {acRelay ? (
            <group position={[CX + 0.52, PCB_Y + 0.055, CZ - 0.03]}>
              <Box size={[0.26, 0.09, 0.2]} pos={[0, 0, 0]} color="#16181c" metal={0.1} rough={0.55} />
              <Box size={[0.24, 0.006, 0.18]} pos={[0, 0.048, 0]} color="#e4e4e7" metal={0} rough={0.8} cast={false} />
              {[-1, 1].map((s) => [-1, 1].map((k) => <Cyl key={`${s}${k}`} r={0.018} len={0.012} pos={[s * 0.09, 0.055, k * 0.06]} color={BRASS} metal={0.85} rough={0.3} seg={12} cast={false} />))}
            </group>
          ) : (
            <group position={[CX + 0.5, PCB_Y + 0.03, CZ - 0.05]}>
              {/* TO-220 MOSFET lying on a small heat-spreader pad */}
              <Box size={[0.16, 0.006, 0.2]} pos={[0, -0.01, 0]} color="#d9b04f" metal={0.85} rough={0.3} cast={false} />
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

          {/* green rising-cage terminal blocks with brass screws at the rear (sensor / switched power / sensor) */}
          {[{ x: CX - 0.35, n: 3 }, { x: CX + 0.2, n: 2 }, { x: CX + 0.6, n: 3 }].map((tb, i) => (
            <group key={i} position={[tb.x, PCB_Y + 0.045, bz + 0.12]}>
              <Box size={[0.07 * tb.n, 0.065, 0.08]} pos={[0, 0, 0]} color="#2f7d3a" metal={0.05} rough={0.6} cast={false} />
              {Array.from({ length: tb.n }, (_, k) => {
                const x = (k - (tb.n - 1) / 2) * 0.07;
                return (
                  <group key={k}>
                    <Box size={[0.003, 0.065, 0.082]} pos={[x + 0.035, 0, 0]} color="#276b31" metal={0.05} rough={0.6} cast={false} />
                    <Cyl r={0.017} len={0.01} pos={[x, 0.036, 0.01]} color={BRASS} metal={0.85} rough={0.3} seg={16} cast={false} />
                    <Box size={[0.028, 0.004, 0.005]} pos={[x, 0.0415, 0.01]} color="#3b2f16" metal={0.3} rough={0.6} cast={false} />
                    <Box size={[0.03, 0.026, 0.002]} pos={[x, 0.0, -0.041]} color="#0a0d0a" metal={0} rough={1} cast={false} />
                  </group>
                );
              })}
            </group>
          ))}

          {/* SMD passives */}
          <instancedMesh ref={caps} args={[undefined, undefined, 26]} castShadow={false}>
            <boxGeometry args={[0.022, 0.008, 0.012]} />
            <meshStandardMaterial color="#a4865a" metalness={0.2} roughness={0.6} />
          </instancedMesh>
          <instancedMesh ref={res} args={[undefined, undefined, 26]} castShadow={false}>
            <boxGeometry args={[0.022, 0.006, 0.012]} />
            <meshStandardMaterial color="#151515" metalness={0.1} roughness={0.6} />
          </instancedMesh>
        </Explode>

        <Lid xrayRef={xrayRef} />
      </group>
    </Selectable>
  );
});
