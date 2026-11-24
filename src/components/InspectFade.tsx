import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { HardwareId } from '../sim/hardwareSpecs';
import { INSPECT_FADE } from '../sim/inspection';

interface Orig { transparent: boolean; opacity: number; depthWrite: boolean }
interface Entry { orig: Orig; cur: number; goal: number }

/**
 * Inspection mode: every material under `root` except the inspected component's subtree (the group tagged
 * userData.hw === selected by <Selectable>) fades smoothly to INSPECT_FADE opacity; faded meshes stop casting
 * the floor silhouette. Materials are mutated in place and restored exactly when the fade-in finishes.
 * `suspend` (X-ray on) restores everything at once, so X-ray never captures a half-faded material.
 */
export function InspectFade({ root, selected, version, suspend }: { root: RefObject<THREE.Object3D>; selected: HardwareId | null; version: string; suspend: boolean }) {
  const mats = useRef(new Map<THREE.Material, Entry>());
  const casts = useRef(new Map<THREE.Mesh, boolean>());
  // re-scan on the next frame (after every effect of this commit, including the X-ray restore, has run)
  const dirty = useRef(true);
  useEffect(() => { dirty.current = true; }, [selected, version]);

  const restore = (mat: THREE.Material, e: Entry) => {
    mat.transparent = e.orig.transparent;
    mat.opacity = e.orig.opacity;
    mat.depthWrite = e.orig.depthWrite;
    mat.needsUpdate = true;
  };
  const restoreAll = () => {
    mats.current.forEach((e, m) => restore(m, e));
    mats.current.clear();
    casts.current.forEach((c, m) => { m.castShadow = c; });
    casts.current.clear();
  };
  useEffect(() => { if (suspend) restoreAll(); }, [suspend]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => restoreAll(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    if (suspend) return;
    if (dirty.current && root.current) {
      dirty.current = false;
      const seenM = new Set<THREE.Material>();
      const seenC = new Set<THREE.Mesh>();
      const visit = (o: THREE.Object3D, keep: boolean) => {
        if (o.userData.hitbox) return;
        const inSel = keep || (selected !== null && o.userData.hw === selected);
        const fade = selected !== null && !inSel;
        const mesh = o as THREE.Mesh;
        const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (m) {
          for (const mat of Array.isArray(m) ? m : [m]) {
            if (seenM.has(mat)) continue;
            seenM.add(mat);
            const e = mats.current.get(mat);
            if (e) e.goal = fade ? INSPECT_FADE : 1;
            else if (fade) mats.current.set(mat, { orig: { transparent: mat.transparent, opacity: mat.opacity, depthWrite: mat.depthWrite }, cur: 1, goal: INSPECT_FADE });
          }
          if (fade && (mesh as THREE.Mesh).isMesh) {
            seenC.add(mesh);
            if (!casts.current.has(mesh)) { casts.current.set(mesh, mesh.castShadow); mesh.castShadow = false; }
          }
        }
        for (const c of o.children) visit(c, inSel);
      };
      visit(root.current, false);
      // materials / meshes that are gone (asset switch) or no longer faded
      mats.current.forEach((e, mat) => { if (!seenM.has(mat)) { restore(mat, e); mats.current.delete(mat); } });
      casts.current.forEach((c, mesh) => { if (!seenC.has(mesh)) { mesh.castShadow = c; casts.current.delete(mesh); } });
    }
    const dt = Math.min(delta, 0.1);
    mats.current.forEach((e, mat) => {
      e.cur = THREE.MathUtils.damp(e.cur, e.goal, 5, dt);
      if (e.goal === 1 && e.cur > 0.995) { restore(mat, e); mats.current.delete(mat); return; }
      if (!mat.transparent || mat.depthWrite) { mat.transparent = true; mat.depthWrite = false; mat.needsUpdate = true; }
      mat.opacity = e.orig.opacity * e.cur;
    });
  });
  return null;
}
