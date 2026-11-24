import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { V3 } from '../../sim/shots';
import type { HardwareId } from '../../sim/hardwareSpecs';
import { INSPECT_LIFT } from '../../sim/inspection';

// ------------------------------------------------------------------ basic procedural meshes
interface CylProps {
  r: number;
  r2?: number; // bottom radius (cone) if different
  len: number;
  pos: V3;
  axis?: 'x' | 'y' | 'z';
  color: string;
  metal?: number;
  rough?: number;
  seg?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  cast?: boolean;
  /** optional roughness map (turned-metal streaks) */
  roughMap?: THREE.Texture;
  /** open tube (no end caps), drawn double-sided */
  open?: boolean;
}
export function Cyl({ r, r2, len, pos, axis = 'y', color, metal = 0.45, rough = 0.45, seg = 40, emissive, emissiveIntensity = 0, opacity = 1, cast = true, roughMap, open = false }: CylProps) {
  const rot: V3 = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <mesh position={pos} rotation={rot} castShadow={cast} receiveShadow>
      <cylinderGeometry args={[r, r2 ?? r, len, seg, 1, open]} />
      <meshStandardMaterial color={color} metalness={metal} roughness={rough} roughnessMap={roughMap ?? null} side={open ? THREE.DoubleSide : THREE.FrontSide} emissive={emissive ?? '#000000'} emissiveIntensity={emissiveIntensity} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

interface BoxProps {
  size: V3;
  pos: V3;
  color: string;
  metal?: number;
  rough?: number;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
  cast?: boolean;
  rot?: V3;
}
export function Box({ size, pos, color, metal = 0.4, rough = 0.5, opacity = 1, emissive, emissiveIntensity = 0, cast = true, rot }: BoxProps) {
  return (
    <mesh position={pos} rotation={rot} castShadow={cast} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} metalness={metal} roughness={rough} emissive={emissive ?? '#000000'} emissiveIntensity={emissiveIntensity} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

// ------------------------------------------------------------------ cables
export function Cable({ points, color = '#111827', radius = 0.02, texture, metal = 0.1, rough = 0.7 }: { points: V3[]; color?: string; radius?: number; texture?: THREE.Texture; metal?: number; rough?: number }) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
    return new THREE.TubeGeometry(curve, 64, radius, 8, false);
  }, [points, radius]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} castShadow>
      <meshStandardMaterial color={color} roughness={rough} metalness={metal} map={texture ?? null} />
    </mesh>
  );
}

/** braided stainless conduit: diagonal strands, repeated along the tube */
export function useBraidTexture(): THREE.CanvasTexture {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 32;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = '#6b7078';
      g.fillRect(0, 0, 64, 32);
      g.lineWidth = 3;
      for (let i = -64; i < 128; i += 8) {
        g.strokeStyle = '#c9ced6';
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 32); g.stroke();
        g.strokeStyle = '#8d939b';
        g.beginPath(); g.moveTo(i + 32, 0); g.lineTo(i, 32); g.stroke();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(60, 1);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** a small canvas texture drawn once (labels, engraving, PCB artwork) */
export function useCanvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, deps: unknown[]): THREE.CanvasTexture {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (g) draw(g);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

// ------------------------------------------------------------------ mount orientation
/** quaternion turning +Y onto the mount normal */
export function normalQuat(normal: V3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...normal).normalize());
}

// ------------------------------------------------------------------ picking (click to inspect)
export interface PickState {
  selected: HardwareId | null;
  onSelect: (id: HardwareId) => void;
}
export const PickContext = createContext<PickState>({ selected: null, onSelect: () => {} });

/** inspection progress of the enclosing Selectable: 0 assembled, 1 lifted and exploded (a ref, read in useFrame) */
export const ExplodeContext = createContext<{ current: number }>({ current: 0 });

/**
 * Wraps a hardware component with an invisible hit box. Hover shows a flat 1 px outline (no glow) and a pointer cursor;
 * click enters inspection. stopPropagation keeps the click from reaching parts behind it.
 * While inspected, the whole component rises INSPECT_LIFT along `normal` and its <Explode> sub-assemblies separate.
 */
export function Selectable({ id, center, size, normal = [0, 1, 0], children }: { id: HardwareId; center: V3; size: V3; normal?: V3; children: ReactNode }) {
  const { selected, onSelect } = useContext(PickContext);
  const [hover, setHover] = useState(false);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(size[0], size[1], size[2])), [size[0], size[1], size[2]]);
  useEffect(() => () => edges.dispose(), [edges]);
  useEffect(() => () => { if (hover) document.body.style.cursor = ''; }, [hover]);
  const on = selected === id;
  const lift = useRef<THREE.Group>(null);
  const k = useRef(0);
  const onRef = useRef(on);
  onRef.current = on;
  useFrame((_, delta) => {
    const goal = onRef.current ? 1 : 0;
    if (k.current === goal) return;
    k.current = THREE.MathUtils.damp(k.current, goal, 4.5, Math.min(delta, 0.1));
    if (Math.abs(k.current - goal) < 1e-3) k.current = goal;
    const e = k.current * k.current * (3 - 2 * k.current);
    lift.current?.position.set(normal[0] * INSPECT_LIFT * e, normal[1] * INSPECT_LIFT * e, normal[2] * INSPECT_LIFT * e);
  });
  return (
    <group ref={lift} userData={{ hw: id }}>
      <ExplodeContext.Provider value={k}>{children}</ExplodeContext.Provider>
      <mesh
        position={center}
        userData={{ hitbox: true }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          // e.delta = pixels moved between pointer down and up: a drag that started here is an orbit, not a selection
          if (e.delta > 4) return;
          onSelect(id);
        }}
      >
        <boxGeometry args={size} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      {hover && !on && (
        <lineSegments geometry={edges} position={center} userData={{ hitbox: true }}>
          <lineBasicMaterial color="#71717a" />
        </lineSegments>
      )}
    </group>
  );
}

/**
 * A sub-assembly that separates during inspection: slides by `offset` and/or turns by `rot` (about `pivot`).
 * It starts after the lift is under way (k > 0.3), so the part rises first and then opens.
 */
export function Explode({ offset = [0, 0, 0], rot, pivot, children }: { offset?: V3; rot?: V3; pivot?: V3; children: ReactNode }) {
  const k = useContext(ExplodeContext);
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!g.current) return;
    const u = THREE.MathUtils.clamp((k.current - 0.3) / 0.7, 0, 1);
    const s = u * u * (3 - 2 * u);
    g.current.position.set(offset[0] * s, offset[1] * s, offset[2] * s);
    if (rot) g.current.rotation.set(rot[0] * s, rot[1] * s, rot[2] * s);
  });
  if (!pivot) return <group ref={g}>{children}</group>;
  return (
    <group position={pivot}>
      <group ref={g}>
        <group position={[-pivot[0], -pivot[1], -pivot[2]]}>{children}</group>
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ small fasteners shared by the hardware
/** socket-head cap screw along +Y: knurled-look head with a recessed hex socket */
export function SocketScrew({ pos, r = 0.024, h = 0.022 }: { pos: V3; r?: number; h?: number }) {
  return (
    <group position={pos}>
      <Cyl r={r} len={h} pos={[0, 0, 0]} color="#c9ced6" metal={0.92} rough={0.28} seg={24} cast={false} />
      <Cyl r={r * 0.82} r2={r} len={h * 0.18} pos={[0, h * 0.5, 0]} color="#d4d8de" metal={0.92} rough={0.25} seg={24} cast={false} />
      <Cyl r={r * 0.45} len={h * 0.5} pos={[0, h * 0.42, 0]} color="#0b0c0e" metal={0.3} rough={0.7} seg={6} cast={false} />
    </group>
  );
}

/** hex nut along +Y */
export function HexNut({ pos, r, h, color = '#b7bcc4', axis = 'y' }: { pos: V3; r: number; h: number; color?: string; axis?: 'x' | 'y' | 'z' }) {
  return <Cyl r={r} len={h} pos={pos} axis={axis} color={color} metal={0.9} rough={0.3} seg={6} cast={false} />;
}

/** turned-metal roughness map: streaks run around a cylinder's circumference (constant along u, varying along v) */
export function useBrushedTexture(): THREE.CanvasTexture {
  return useCanvasTexture(4, 256, (g) => {
    for (let y = 0; y < 256; y++) {
      const v = 110 + (((Math.sin(y * 12.9898) * 43758.5453) % 1) + 1) % 1 * 120;
      g.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
      g.fillRect(0, y, 4, 1);
    }
  }, []);
}

// ------------------------------------------------------------------ X-ray
interface XrayOrig { transparent: boolean; opacity: number; depthWrite: boolean; wireframe: boolean }

/**
 * Host-machine X-ray: every material under `root` becomes a 25% opacity wireframe (depthWrite off), or is restored.
 * Materials are mutated in place (shared materials such as the heat-mapped motor housing are touched once), so there is
 * no remount and the heat map keeps animating the same material.
 */
export function applyXray(root: THREE.Object3D | null, on: boolean): void {
  if (!root) return;
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o.userData.hitbox) return;
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      const w = mat as THREE.Material & { wireframe?: boolean };
      if (on) {
        if (!mat.userData.xrayOrig) mat.userData.xrayOrig = { transparent: mat.transparent, opacity: mat.opacity, depthWrite: mat.depthWrite, wireframe: !!w.wireframe } as XrayOrig;
        mat.transparent = true;
        mat.opacity = Math.min(0.25, (mat.userData.xrayOrig as XrayOrig).opacity);
        mat.depthWrite = false;
        if ('wireframe' in w) w.wireframe = true;
      } else if (mat.userData.xrayOrig) {
        const o0 = mat.userData.xrayOrig as XrayOrig;
        mat.transparent = o0.transparent;
        mat.opacity = o0.opacity;
        mat.depthWrite = o0.depthWrite;
        if ('wireframe' in w) w.wireframe = o0.wireframe;
        delete mat.userData.xrayOrig;
      }
      mat.needsUpdate = true;
    }
  });
}
