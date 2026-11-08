import { memo, useEffect, useMemo, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Edges, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Bell, BellOff, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import type { Simulator, Snapshot } from '../sim/engine';
import type { WalkState } from '../sim/walkthrough';
import { CONFIG as C } from '../sim/config';
import { HOME_POS, HOME_TARGET } from '../sim/shots';
import type { CameraShot, ShotName, V3 } from '../sim/shots';
import { BENCH_MOUNTS, FLOOR_Y, HARNESS, HARNESS_BENCH_SIGNAL, HARNESS_INDUSTRIAL, NODE, PLATE_TOP, SHAFT_Y } from '../sim/mounts';
import type { SensorKit } from '../sim/mounts';
import type { HardwareId } from '../sim/hardwareSpecs';
import type { LabelRegistry } from './LabelLayer';
import { SeverityBar } from './SeverityBar';
import { Minimap } from './Minimap';
import { TripFx } from './Fx';
import { CanvasBoundary } from './CanvasBoundary';
import { Box, Cable, Cyl, PickContext, applyXray, useBraidTexture } from './hardware/primitives';
import { EdgeNode } from './hardware/EdgeNode';
import type { NodeLeds } from './hardware/EdgeNode';
import { VibrationPuck } from './hardware/VibrationPuck';
import { CurrentSensor } from './hardware/CurrentSensor';
import { IrPod, TempProbe } from './hardware/TempSensor';

// ------------------------------------------------------------------ static rig (does not vibrate)
const BaseRig = memo(function BaseRig() {
  const rails: V3[] = [[-0.1, -0.1, 1.0], [-0.1, -0.1, -1.0]];
  const cross: number[] = [-3.1, -0.1, 2.9];
  const feet: V3[] = [[-3.1, FLOOR_Y + 0.06, 1.0], [-3.1, FLOOR_Y + 0.06, -1.0], [2.9, FLOOR_Y + 0.06, 1.0], [2.9, FLOOR_Y + 0.06, -1.0]];
  return (
    <group>
      {rails.map((p, i) => (
        <group key={i}>
          <Box size={[6.2, 0.2, 0.2]} pos={p} color="#9aa3ad" metal={0.65} rough={0.4} />
          {/* T-slot channel */}
          <Box size={[6.2, 0.07, 0.02]} pos={[p[0], p[1], p[2] + (p[2] > 0 ? 0.101 : -0.101)]} color="#1f2937" cast={false} />
        </group>
      ))}
      {cross.map((x, i) => (
        <group key={i}>
          <Box size={[0.2, 0.2, 2.2]} pos={[x, -0.1, 0]} color="#9aa3ad" metal={0.65} rough={0.4} />
          <Box size={[0.02, 0.07, 2.2]} pos={[x + 0.101, -0.1, 0]} color="#1f2937" cast={false} />
        </group>
      ))}
      {/* aluminium base plate the motor cradle and bearing bolt to (sits on the rails, so nothing floats) */}
      <Box size={[4.4, PLATE_TOP, 2.3]} pos={[-0.5, PLATE_TOP / 2, 0]} color="#6b7280" metal={0.6} rough={0.5} />
      {/* corner brackets */}
      {[[-3.1, 1.0], [-3.1, -1.0], [2.9, 1.0], [2.9, -1.0]].map(([x, z], i) => (
        <Box key={i} size={[0.32, 0.05, 0.32]} pos={[x, 0.025, z]} color="#cbd5e1" metal={0.7} rough={0.35} />
      ))}
      {/* rubber feet */}
      {feet.map((p, i) => (
        <Cyl key={i} r={0.14} len={0.12} pos={p} color="#0a0a0a" metal={0} rough={0.95} />
      ))}
    </group>
  );
});

// ------------------------------------------------------------------ brushed-metal roughness texture
function makeBrushedTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    for (let x = 0; x < 256; x++) {
      const v = 150 + Math.random() * 90; // streaks along the shaft axis
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, 0, 1, 64);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ------------------------------------------------------------------ vibrating machine + rotating group
interface MachineProps {
  sim: Simulator;
  slowMo: number;
  kit: SensorKit;
  hostRef: RefObject<THREE.Group>;
}
const Machine = memo(function Machine({ sim, slowMo, kit, hostRef }: MachineProps) {
  const mach = useRef<THREE.Group>(null);
  const wob = useRef<THREE.Group>(null);
  const rot = useRef<THREE.Group>(null);
  const massGrp = useRef<THREE.Group>(null);
  const angle = useRef(0);
  const slowRef = useRef(slowMo);
  slowRef.current = slowMo;
  const braid = useBraidTexture();

  // one shared material for the can and its fins, so the heat map lights the whole housing (and keeps working in X-ray)
  const motorMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: '#2b4a52', metalness: 0.7, roughness: 0.42, roughnessMap: makeBrushedTexture(),
      emissive: new THREE.Color('#0d2a30'), emissiveIntensity: 0.25,
    });
  }, []);
  useEffect(() => () => { motorMat.dispose(); }, [motorMat]);

  const col = useMemo(() => ({
    cool: new THREE.Color('#0d2a30'), orange: new THREE.Color('#ff6a1a'), red: new THREE.Color('#ff2a0a'),
    baseCool: new THREE.Color('#2b4a52'), baseHot: new THREE.Color('#5a2a1c'), tmp: new THREE.Color(),
  }), []);

  useFrame((state, delta) => {
    const L = sim.live;
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    // rotation (visually slowed so it can be seen)
    angle.current += (L.rpm / 60) * Math.PI * 2 * dt * slowRef.current;
    if (rot.current) rot.current.rotation.x = angle.current;

    // vibration, tied to the measured severity: whirl at the shaft angle + superlinear structural flutter
    const vib = Math.min(L.vibMeas, 10);
    const run = L.rpm > 5 ? 1 : 0.4;
    const amp = (0.01 * vib + 0.0016 * vib * vib) * run;
    const flutter = Math.sin(t * 2 * Math.PI * 37) * 0.5 + (Math.random() - 0.5);
    if (mach.current) {
      mach.current.position.set(
        0,
        amp * Math.cos(angle.current) + amp * 0.35 * flutter,
        amp * Math.sin(angle.current) + amp * 0.35 * (Math.random() - 0.5) * 2,
      );
      mach.current.rotation.z = 0.0035 * vib * (vib / 6) * flutter * run;
      mach.current.rotation.y = 0.0025 * vib * (vib / 6) * (Math.random() - 0.5) * 2 * run;
    }
    // flywheel precession: the rotor visibly wobbles about its bearing at high imbalance
    if (wob.current) {
      const tilt = Math.min(0.07, 0.0085 * vib * (L.rpm > 5 ? 1 : 0));
      wob.current.rotation.y = tilt * Math.sin(angle.current);
      wob.current.rotation.z = tilt * Math.cos(angle.current);
    }

    // heat map: slate/teal until ~40 C, warm tint to 60 C, then orange to red up to 95 C (range retuned in Phase 3, D12)
    const T = L.temp;
    let k = 0;
    if (T > 60) k = 0.25 + 0.75 * THREE.MathUtils.clamp((T - 60) / 35, 0, 1);
    else if (T > 40) k = 0.25 * THREE.MathUtils.clamp((T - 40) / 20, 0, 1);
    if (k < 0.6) col.tmp.copy(col.cool).lerp(col.orange, k / 0.6);
    else col.tmp.copy(col.orange).lerp(col.red, (k - 0.6) / 0.4);
    motorMat.emissive.copy(col.tmp);
    motorMat.emissiveIntensity = 0.2 + 2.1 * Math.pow(k, 1.6);
    motorMat.color.copy(col.baseCool).lerp(col.baseHot, k * 0.6);

    // eccentric mass: size follows the slider and it flexes radially when the rotor is shaking
    if (massGrp.current) {
      const sc = 0.55 + (0.9 * (L.massG - C.massMin)) / (C.massMax - C.massMin);
      massGrp.current.scale.set(sc, sc, sc);
      massGrp.current.position.y = 0.4 * (1 + 0.05 * (vib / 8) * Math.sin(t * 19));
    }
  });

  const holeAngles = useMemo(() => Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2), []);
  const m = BENCH_MOUNTS;

  return (
    <group ref={mach}>
      {/* ---------------- host machine (dimmed by X-ray) ---------------- */}
      <group ref={hostRef}>
        {/* motor cradle (bolted to the base plate) */}
        <Box size={[1.0, 0.43 - PLATE_TOP, 0.9]} pos={[-1.8, PLATE_TOP + (0.43 - PLATE_TOP) / 2, 0]} color="#52525b" metal={0.5} rough={0.5} />

        {/* 12 V DC motor can */}
        <mesh position={[-1.8, SHAFT_Y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <cylinderGeometry args={[0.42, 0.42, 1.3, 48]} />
          <primitive object={motorMat} attach="material" />
        </mesh>
        {/* stylised cooling fins around the housing (shares the heat-map material) */}
        {Array.from({ length: 24 }, (_, i) => (
          <group key={i} position={[-1.8, SHAFT_Y, 0]} rotation={[(i / 24) * Math.PI * 2, 0, 0]}>
            <mesh position={[0.02, 0.45, 0]} castShadow>
              <boxGeometry args={[0.9, 0.1, 0.022]} />
              <primitive object={motorMat} attach="material" />
            </mesh>
          </group>
        ))}
        {/* rear cap with vent slits */}
        <Cyl r={0.45} len={0.14} pos={[-2.52, SHAFT_Y, 0]} axis="x" color="#18232a" metal={0.55} rough={0.4} />
        {Array.from({ length: 8 }, (_, i) => (
          <group key={i} position={[-2.6, SHAFT_Y, 0]} rotation={[(i / 8) * Math.PI * 2, 0, 0]}>
            <Box size={[0.02, 0.15, 0.05]} pos={[0, 0.27, 0]} color="#05080a" cast={false} />
          </group>
        ))}
        {/* front flange + bolts */}
        <Cyl r={0.5} len={0.06} pos={[-1.15, SHAFT_Y, 0]} axis="x" color="#3f3f46" metal={0.7} rough={0.35} />
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          return <Cyl key={i} r={0.03} len={0.05} pos={[-1.11, SHAFT_Y + 0.4 * Math.cos(a), 0.4 * Math.sin(a)]} axis="x" color="#d4d4d8" metal={0.9} rough={0.3} seg={6} cast={false} />;
        })}
        {/* terminal cap and the motor power lead (through the current sensor to the cut-off in the node) */}
        <Box size={[0.3, 0.1, 0.22]} pos={[-2.1, SHAFT_Y + 0.52, 0]} color="#0a0a0a" metal={0.1} rough={0.8} />
        <Cable points={HARNESS.power} radius={0.026} color="#18181b" />

        {/* pillow-block bearing (UCP204-style) */}
        <Box size={[0.6, 0.12, 1.0]} pos={[0.5, PLATE_TOP + 0.06, 0]} color="#3f3f46" metal={0.6} rough={0.45} />
        <Box size={[0.36, 0.62, 0.5]} pos={[0.5, 0.47, 0]} color="#52525b" metal={0.55} rough={0.45} />
        <Cyl r={0.24} len={0.4} pos={[0.5, SHAFT_Y, 0]} axis="x" color="#3f3f46" metal={0.6} rough={0.4} />
        <Cyl r={0.14} len={0.44} pos={[0.5, SHAFT_Y, 0]} axis="x" color="#a1a1aa" metal={0.85} rough={0.3} />
        {[-0.38, 0.38].map((z) => (
          <Cyl key={z} r={0.04} len={0.08} pos={[0.5, PLATE_TOP + 0.16, z]} color="#d4d4d8" metal={0.9} rough={0.3} seg={6} cast={false} />
        ))}

        {/* rotor: wobble group (precession) > rotating group (shaft, keyway, flywheel, eccentric mass) */}
        <group ref={wob} position={[0, SHAFT_Y, 0]}>
          <group ref={rot}>
            <Cyl r={0.045} len={3.1} pos={[0.4, 0, 0]} axis="x" color="#e5e7eb" metal={0.9} rough={0.25} />
            <Box size={[0.4, 0.02, 0.03]} pos={[-0.7, 0.045, 0]} color="#52525b" cast={false} />
            <Cyl r={0.58} len={0.1} pos={[1.4, 0, 0]} axis="x" color="#a8b0ba" metal={0.8} rough={0.35} seg={64} />
            <Cyl r={0.12} len={0.14} pos={[1.4, 0, 0]} axis="x" color="#71717a" metal={0.8} rough={0.3} />
            {holeAngles.map((a, i) => (
              <Cyl key={i} r={0.035} len={0.11} pos={[1.4, 0.4 * Math.cos(a), 0.4 * Math.sin(a)]} axis="x" color="#0a0a0a" metal={0} rough={1} seg={12} cast={false} />
            ))}
            <group ref={massGrp} position={[1.49, 0.4, 0]}>
              <Cyl r={0.05} len={0.14} pos={[0, 0, 0]} axis="x" color="#f97316" metal={0.3} rough={0.5} seg={24} />
              <Cyl r={0.085} len={0.06} pos={[0.05, 0, 0]} axis="x" color="#ea580c" metal={0.35} rough={0.45} seg={6} />
            </group>
          </group>
        </group>

        {/* transparent acrylic guard around the flywheel */}
        <mesh position={[1.4, SHAFT_Y, 0]}>
          <boxGeometry args={[0.5, 1.5, 1.5]} />
          <meshPhysicalMaterial color="#cbd5e1" transparent opacity={0.06} roughness={0.1} metalness={0} depthWrite={false} />
          <Edges color="#52525b" />
        </mesh>
      </group>

      {/* ---------------- Machynex sensor hardware (stays opaque in X-ray) ---------------- */}
      <VibrationPuck mount={m.puck} />
      <Cable points={HARNESS.puck} radius={0.022} color="#ffffff" texture={braid} metal={0.6} rough={0.4} />

      {kit === 'bench' && (
        <>
          <TempProbe mount={m.temp} />
          <Cable points={HARNESS.tempProbe} radius={0.012} color="#d4d4d8" />
        </>
      )}

      <CurrentSensor mount={m.current} kit={kit} />
      {kit === 'bench'
        ? <Cable points={HARNESS_BENCH_SIGNAL} radius={0.011} color="#52525b" />
        : <Cable points={HARNESS_INDUSTRIAL.ctOut} radius={0.013} color="#111113" />}
    </group>
  );
});

// ------------------------------------------------------------------ label anchors (projected to screen every frame)
const ANCHORS: { id: string; pos: V3 }[] = [
  { id: 'motor', pos: [-2.2, 1.0, 0.45] },
  { id: 'temp', pos: [-1.85, 1.45, 0] },
  { id: 'mpu', pos: [0.5, 1.3, 0] },
  { id: 'current', pos: [-0.4, 0.14, 0.62] },
  { id: 'flywheel', pos: [1.4, 1.45, 0] },
  { id: 'edge', pos: [NODE.center[0], 0.2, NODE.center[2]] },
];

function LabelProjector({ registry }: { registry: { current: LabelRegistry } }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  useFrame((state) => {
    const { camera, size } = state;
    const reg = registry.current;
    reg.size.w = size.width;
    reg.size.h = size.height;
    for (const a of ANCHORS) {
      v.set(a.pos[0], a.pos[1], a.pos[2]).project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      reg.points[a.id] = { x, y, vis: v.z < 1 && v.z > -1 && x > 0 && x < size.width && y > 0 && y < size.height };
    }
    reg.cam.x = camera.position.x;
    reg.cam.z = camera.position.z;
    reg.cam.tx = controls ? controls.target.x : 0;
    reg.cam.tz = controls ? controls.target.z : 0;
  });
  return null;
}

// ------------------------------------------------------------------ camera director (guided shots + pan limits)
interface ControlsLike {
  target: THREE.Vector3;
  update: () => void;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
}

function CameraDirector({ shot }: { shot: CameraShot | null }) {
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const camera = useThree((s) => s.camera);
  const goalPos = useMemo(() => new THREE.Vector3(), []);
  const goalTarget = useMemo(() => new THREE.Vector3(), []);
  const active = useRef(false);

  useEffect(() => {
    if (!shot) return;
    goalPos.set(shot.pos[0], shot.pos[1], shot.pos[2]);
    goalTarget.set(shot.target[0], shot.target[1], shot.target[2]);
    active.current = true;
  }, [shot, goalPos, goalTarget]);

  useEffect(() => {
    if (!controls || !controls.addEventListener) return;
    const cancel = () => { active.current = false; }; // the user took over
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);

  useFrame((_, delta) => {
    if (!controls) return;
    if (active.current) {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * 2.4);
      camera.position.lerp(goalPos, k);
      controls.target.lerp(goalTarget, k);
      controls.update();
      if (camera.position.distanceTo(goalPos) < 0.02 && controls.target.distanceTo(goalTarget) < 0.02) active.current = false;
    } else {
      controls.target.x = THREE.MathUtils.clamp(controls.target.x, -3.5, 3.5);
      controls.target.y = THREE.MathUtils.clamp(controls.target.y, -0.2, 2.2);
      controls.target.z = THREE.MathUtils.clamp(controls.target.z, -2.5, 3.0);
    }
  });
  return null;
}

// procedural image-based lighting (no HDR download), so metals have something to reflect
function EnvLight() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = rt.texture;
    (scene as unknown as { environmentIntensity: number }).environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

interface WorldProps {
  sim: Simulator;
  slowMo: number;
  registry: { current: LabelRegistry };
  shot: CameraShot | null;
  walkActive: boolean;
  kit: SensorKit;
  xray: boolean;
}

function World({ sim, slowMo, registry, shot, walkActive, kit, xray }: WorldProps) {
  const g = useRef<THREE.MeshStandardMaterial>(null);
  const a = useRef<THREE.MeshStandardMaterial>(null);
  const r = useRef<THREE.MeshStandardMaterial>(null);
  const relay = useRef<THREE.MeshStandardMaterial>(null);
  const leds: NodeLeds = useMemo(() => ({ g, a, r, relay }), []);
  const baseRef = useRef<THREE.Group>(null);
  const hostRef = useRef<THREE.Group>(null);

  // X-ray: host machine + rig become 25% wireframe (materials mutated in place; no remount, heat map unaffected)
  useEffect(() => {
    applyXray(baseRef.current, xray);
    applyXray(hostRef.current, xray);
  }, [xray]);

  return (
    <>
      <color attach="background" args={['#09090b']} />
      <fog attach="fog" args={['#09090b', 18, 42]} />
      <EnvLight />
      <ambientLight intensity={0.25} />
      <hemisphereLight args={['#9fb4ff', '#1a1a22', 0.35]} />
      <directionalLight position={[6, 9, 5]} intensity={2.0} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} />
      <pointLight position={[-5, 3, 4]} intensity={35} color="#7dd3fc" />
      <pointLight position={[4, 2, -4]} intensity={22} color="#fbbf24" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y - 0.001, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#0c0c10" roughness={0.95} metalness={0} />
      </mesh>
      <gridHelper args={[40, 40, '#1e293b', '#12151c']} position={[0, FLOOR_Y, 0]} />

      <group ref={baseRef}><BaseRig /></group>
      <Machine sim={sim} slowMo={slowMo} kit={kit} hostRef={hostRef} />

      {/* static Machynex hardware: edge node, 12 V adapter, (concept kit) IR pod on its bracket */}
      <EdgeNode sim={sim} kit={kit} xray={xray} leds={leds} />
      <Box size={[0.8, 0.26, 0.5]} pos={[-1.9, FLOOR_Y + 0.13, 2.3]} color="#27272a" metal={0.2} rough={0.7} />
      <Cable points={HARNESS.supply} radius={0.025} />
      {kit === 'industrial' && (
        <>
          <IrPod mount={BENCH_MOUNTS.temp} />
          <Cable points={HARNESS_INDUSTRIAL.irTemp} radius={0.013} color="#d4d4d8" />
        </>
      )}

      <TripFx sim={sim} />
      <LabelProjector registry={registry} />

      <OrbitControls makeDefault enabled={!walkActive} enableDamping dampingFactor={0.08} minDistance={1.2} maxDistance={18} minPolarAngle={0.15} maxPolarAngle={Math.PI * 0.49} rotateSpeed={0.7} target={HOME_TARGET} />
      <CameraDirector shot={shot} />
    </>
  );
}

// ------------------------------------------------------------------ public viewport
interface ViewportProps {
  sim: Simulator;
  snap: Snapshot;
  paused: boolean;
  onTogglePause: () => void;
  muted: boolean;
  onToggleMute: () => void;
  alarms: boolean;
  onToggleAlarms: () => void;
  onUserGesture: () => void;
  shot: CameraShot | null;
  onFocus: (name: ShotName) => void;
  walk: WalkState;
  onStopWalk: () => void;
  slowMo: number;
  kit: SensorKit;
  xray: boolean;
  selected: HardwareId | null;
  onSelect: (id: HardwareId) => void;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md border border-line bg-panel text-zinc-400 transition-colors hover:text-zinc-100"
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function Viewport({ sim, snap, paused, onTogglePause, muted, onToggleMute, alarms, onToggleAlarms, onUserGesture, shot, onFocus, walk, onStopWalk, slowMo, kit, xray, selected, onSelect }: ViewportProps) {
  // the registry is filled by LabelProjector: the minimap reads the camera from it
  const registry = useRef<LabelRegistry>({ points: {}, cam: { x: 0, z: 0, tx: 0, tz: 0 }, size: { w: 1, h: 1 } });
  const pick = useMemo(() => ({ selected, onSelect }), [selected, onSelect]);

  return (
    <div className="relative h-full w-full bg-canvas" onPointerDown={onUserGesture}>
      <CanvasBoundary>
        <Canvas shadows dpr={[1, 1.75]} camera={{ position: HOME_POS, fov: 38, near: 0.1, far: 100 }} gl={{ antialias: true }}>
          <PickContext.Provider value={pick}>
            <World sim={sim} slowMo={slowMo} registry={registry} shot={shot} walkActive={walk.active} kit={kit} xray={xray} />
          </PickContext.Provider>
        </Canvas>
      </CanvasBoundary>

      <div className="pointer-events-none absolute left-3 top-3 flex gap-1.5">
        <IconButton label={paused ? 'Resume simulation' : 'Pause simulation'} onClick={onTogglePause}>{paused ? <Play size={13} /> : <Pause size={13} />}</IconButton>
        <IconButton label={muted ? 'Sound off (click to enable)' : 'Sound on (click to mute)'} onClick={onToggleMute}>{muted ? <VolumeX size={13} /> : <Volume2 size={13} />}</IconButton>
        <IconButton label={alarms ? 'Alarm beeps on' : 'Alarm beeps off'} onClick={onToggleAlarms}>{alarms ? <Bell size={13} /> : <BellOff size={13} />}</IconButton>
        {paused && <span className="font-mono flex h-7 items-center rounded-md border border-line bg-panel px-2 text-[11px] text-zinc-400">PAUSED</span>}
      </div>

      {walk.active && (
        <div className="pointer-events-auto absolute left-3 top-12 w-[min(28rem,calc(100%-1.5rem))] rounded-md border border-line bg-panel p-3" role="status" aria-live="polite">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Walkthrough · scene {walk.scene}/{walk.total}</span>
            <button className="rounded-md border border-line px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-900" onClick={onStopWalk}>Stop</button>
          </div>
          <div className="text-sm font-medium text-zinc-100">{walk.title}</div>
          <p className="mt-1 text-xs leading-snug text-zinc-400">{walk.caption}</p>
          <div className="mt-2 h-px w-full bg-zinc-800"><div className="h-px bg-zinc-300" style={{ width: `${Math.round(walk.progress * 100)}%` }} /></div>
        </div>
      )}

      {kit === 'industrial' && (
        <div className="pointer-events-none absolute right-3 top-3 max-w-[18rem] rounded-md border border-line bg-panel px-3 py-2 text-[11px] leading-snug text-zinc-400" role="note">
          <div className="font-mono text-warn">CONCEPT · not in the proposed bill of materials</div>
          <div className="mt-0.5">Industrial-retrofit kit preview on the DC bench rig. The CT clamp is AC only and could not measure this DC lead.</div>
        </div>
      )}
      {xray && (
        <div className="font-mono pointer-events-none absolute left-3 top-12 rounded-md border border-line bg-panel px-2 py-1 text-[11px] text-zinc-400">X-RAY · host machine at 25 %</div>
      )}

      <div className="pointer-events-auto absolute bottom-3 left-3">
        <SeverityBar snap={snap} />
      </div>

      <div className="absolute bottom-3 right-3 hidden md:block">
        <Minimap registry={registry} onFocus={onFocus} />
      </div>
    </div>
  );
}
