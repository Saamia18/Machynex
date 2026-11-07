import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Simulator } from '../sim/engine';

const ORIGIN: [number, number, number] = [0.5, 0.95, 0];
const N_SPARK = 160;
const N_SMOKE = 40;

function softTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

/** Procedural sparks and smoke at the bearing housing, triggered when the state enters CRITICAL. */
export function TripFx({ sim }: { sim: Simulator }) {
  const smokeGroup = useRef<THREE.Group>(null);
  const flash = useRef<THREE.PointLight>(null);
  const prevCrit = useRef(false);
  const smokeTime = useRef(0);
  const smokeAcc = useRef(0);
  const flashT = useRef(0);

  const spark = useMemo(() => {
    const pos = new Float32Array(N_SPARK * 3);
    const col = new Float32Array(N_SPARK * 3);
    for (let i = 0; i < N_SPARK; i++) pos[i * 3 + 1] = -100;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return { geo, pos, col, vel: new Float32Array(N_SPARK * 3), life: new Float32Array(N_SPARK), max: new Float32Array(N_SPARK), next: 0 };
  }, []);

  const smoke = useMemo(() => ({
    tex: null as THREE.CanvasTexture | null,
    sprites: [] as THREE.Sprite[],
    age: new Float32Array(N_SMOKE),
    max: new Float32Array(N_SMOKE),
    vx: new Float32Array(N_SMOKE),
    vz: new Float32Array(N_SMOKE),
    next: 0,
  }), []);

  useEffect(() => {
    const group = smokeGroup.current;
    if (!group) return;
    const tex = softTexture();
    smoke.tex = tex;
    for (let i = 0; i < N_SMOKE; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: new THREE.Color('#5b6270') });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      group.add(sp);
      smoke.sprites.push(sp);
    }
    return () => {
      for (const sp of smoke.sprites) {
        group.remove(sp);
        (sp.material as THREE.SpriteMaterial).dispose();
      }
      smoke.sprites = [];
      tex.dispose();
      spark.geo.dispose();
    };
  }, [smoke, spark]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const crit = sim.live.state === 'CRITICAL';
    if (crit && !prevCrit.current) {
      // burst of sparks, a red flash and a smoke plume
      for (let n = 0; n < 130; n++) {
        const i = spark.next;
        spark.next = (spark.next + 1) % N_SPARK;
        const a = Math.random() * Math.PI * 2;
        const up = 0.4 + Math.random() * 0.9;
        const sp = 1.5 + Math.random() * 3.2;
        spark.pos[i * 3] = ORIGIN[0] + (Math.random() - 0.5) * 0.3;
        spark.pos[i * 3 + 1] = ORIGIN[1];
        spark.pos[i * 3 + 2] = ORIGIN[2] + (Math.random() - 0.5) * 0.3;
        spark.vel[i * 3] = Math.cos(a) * sp * 0.6;
        spark.vel[i * 3 + 1] = up * sp;
        spark.vel[i * 3 + 2] = Math.sin(a) * sp;
        spark.max[i] = 0.5 + Math.random() * 0.7;
        spark.life[i] = spark.max[i];
      }
      smokeTime.current = 7;
      flashT.current = 0.5;
    }
    if (!crit && prevCrit.current) smokeTime.current = Math.min(smokeTime.current, 1.5);
    prevCrit.current = crit;

    // sparks
    for (let i = 0; i < N_SPARK; i++) {
      if (spark.life[i] <= 0) continue;
      spark.life[i] -= dt;
      if (spark.life[i] <= 0) {
        spark.pos[i * 3 + 1] = -100;
        continue;
      }
      spark.vel[i * 3 + 1] -= 7.5 * dt;
      spark.pos[i * 3] += spark.vel[i * 3] * dt;
      spark.pos[i * 3 + 1] += spark.vel[i * 3 + 1] * dt;
      spark.pos[i * 3 + 2] += spark.vel[i * 3 + 2] * dt;
      if (spark.pos[i * 3 + 1] < -0.3) { spark.pos[i * 3 + 1] = -0.3; spark.vel[i * 3 + 1] *= -0.3; }
      const f = spark.life[i] / spark.max[i];
      spark.col[i * 3] = 1;
      spark.col[i * 3 + 1] = 0.35 + 0.5 * f;
      spark.col[i * 3 + 2] = 0.1 * f;
    }
    (spark.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (spark.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    // smoke emission
    if (smokeTime.current > 0 && smoke.sprites.length) {
      smokeTime.current -= dt;
      smokeAcc.current += dt * (4 + 6 * Math.min(1, smokeTime.current / 7));
      while (smokeAcc.current >= 1) {
        smokeAcc.current -= 1;
        const i = smoke.next;
        smoke.next = (smoke.next + 1) % N_SMOKE;
        smoke.age[i] = 0;
        smoke.max[i] = 2.4 + Math.random() * 1.6;
        smoke.vx[i] = (Math.random() - 0.5) * 0.25;
        smoke.vz[i] = (Math.random() - 0.5) * 0.25;
        const s = smoke.sprites[i];
        s.position.set(ORIGIN[0] + (Math.random() - 0.5) * 0.2, ORIGIN[1] + 0.1, ORIGIN[2] + (Math.random() - 0.5) * 0.2);
        s.visible = true;
      }
    }
    for (let i = 0; i < smoke.sprites.length; i++) {
      const s = smoke.sprites[i];
      if (!s.visible) continue;
      smoke.age[i] += dt;
      const u = smoke.age[i] / smoke.max[i];
      if (u >= 1) { s.visible = false; (s.material as THREE.SpriteMaterial).opacity = 0; continue; }
      s.position.y += (0.55 - 0.25 * u) * dt;
      s.position.x += smoke.vx[i] * dt;
      s.position.z += smoke.vz[i] * dt;
      const sc = 0.3 + 1.1 * u;
      s.scale.set(sc, sc, sc);
      (s.material as THREE.SpriteMaterial).opacity = 0.42 * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - 0.3 * u);
    }

    // red flash
    if (flash.current) {
      flashT.current = Math.max(0, flashT.current - dt);
      flash.current.intensity = flashT.current > 0 ? 60 * (flashT.current / 0.5) : 0;
    }
  });

  return (
    <group>
      <points geometry={spark.geo} frustumCulled={false}>
        <pointsMaterial size={0.075} vertexColors transparent blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
      </points>
      <group ref={smokeGroup} />
      <pointLight ref={flash} position={[0.5, 1.1, 0.4]} color="#ff5a2a" intensity={0} distance={6} />
    </group>
  );
}
