import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { V3 } from '../../sim/shots';
import type { HardwareId } from '../../sim/hardwareSpecs';

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
}
export function Cyl({ r, r2, len, pos, axis = 'y', color, metal = 0.45, rough = 0.45, seg = 40, emissive, emissiveIntensity = 0, opacity = 1, cast = true }: CylProps) {
  const rot: V3 = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <mesh position={pos} rotation={rot} castShadow={cast} receiveShadow>
      <cylinderGeometry args={[r, r2 ?? r, len, seg]} />
      <meshStandardMaterial color={color} metalness={metal} roughness={rough} emissive={emissive ?? '#000000'} emissiveIntensity={emissiveIntensity} transparent={opacity < 1} opacity={opacity} />
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

/**
 * Wraps a hardware component with an invisible hit box. Hover shows a flat 1 px outline (no glow) and a pointer cursor;
 * click opens the inspector. stopPropagation keeps the click from reaching parts behind it.
 */
export function Selectable({ id, center, size, children }: { id: HardwareId; center: V3; size: V3; children: ReactNode }) {
  const { selected, onSelect } = useContext(PickContext);
  const [hover, setHover] = useState(false);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(size[0], size[1], size[2])), [size[0], size[1], size[2]]);
  useEffect(() => () => edges.dispose(), [edges]);
  useEffect(() => () => { if (hover) document.body.style.cursor = ''; }, [hover]);
  const active = hover || selected === id;
  return (
    <group>
      {children}
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
      {active && (
        <lineSegments geometry={edges} position={center} userData={{ hitbox: true }}>
          <lineBasicMaterial color={selected === id ? '#e4e4e7' : '#71717a'} />
        </lineSegments>
      )}
    </group>
  );
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
