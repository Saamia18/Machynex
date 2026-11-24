import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Mount, SensorKit } from '../../sim/mounts';
import type { V3 } from '../../sim/shots';
import { Box, Cyl, Explode, HexNut, Selectable, normalQuat, useBrushedTexture, useCanvasTexture } from './primitives';

const STEEL = '#c3c8cf';
const BRASS = '#b58a45';

/**
 * Tri-axial vibration pod (MPU6050 on the bench kit, ADXL345-class on the concept kit). Concept packaging.
 * Local +Y = mount normal. Static base: spot-faced pad, M6 stud, hex base. Inside (seen when the housing lifts during
 * inspection): silicone potting ring, brass standoffs, round FR4 board with the MEMS QFN and decoupling capacitors.
 * Housing: brushed stainless body with a knurled grip band, chamfered bezel, etched X / Y / Z arrows, gland nut and
 * heat-shrink strain relief where the braided conduit (drawn by the scene) leaves.
 */
export function VibrationPuck({ mount, kit = 'bench' }: { mount: Mount; kit?: SensorKit }) {
  const q = useMemo(() => normalQuat(mount.normal), [mount.normal]);
  const along = (d: number): V3 => [mount.pos[0] + mount.normal[0] * d, mount.pos[1] + mount.normal[1] * d, mount.pos[2] + mount.normal[2] * d];
  const brushed = useBrushedTexture();
  const knurl = useRef<THREE.InstancedMesh>(null);
  const N = 40;
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 4);
      m.compose(new THREE.Vector3(Math.cos(a) * 0.0835, 0, Math.sin(a) * 0.0835), qq, new THREE.Vector3(1, 1, 1));
      knurl.current?.setMatrixAt(i, m);
    }
    if (knurl.current) knurl.current.instanceMatrix.needsUpdate = true;
  }, []);

  // etched top face: axis arrows and the part code (laser etching = darker oxide lines on brushed steel)
  const topTex = useCanvasTexture(256, 256, (g) => {
    g.fillStyle = '#c7ccd3';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#4b5058';
    g.fillStyle = '#4b5058';
    g.lineWidth = 7;
    const arrow = (x0: number, y0: number, x1: number, y1: number) => {
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const a = Math.atan2(y1 - y0, x1 - x0);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - 22 * Math.cos(a - 0.45), y1 - 22 * Math.sin(a - 0.45)); g.lineTo(x1 - 22 * Math.cos(a + 0.45), y1 - 22 * Math.sin(a + 0.45)); g.closePath(); g.fill();
    };
    arrow(96, 160, 196, 160); // X
    arrow(96, 160, 96, 60); // Y
    g.beginPath(); g.arc(96, 160, 14, 0, Math.PI * 2); g.stroke(); // Z out of the face
    g.beginPath(); g.arc(96, 160, 4, 0, Math.PI * 2); g.fill();
    g.font = 'bold 30px monospace';
    g.fillText('X', 186, 200);
    g.fillText('Y', 58, 74);
    g.fillText('Z', 120, 196);
    g.font = '20px monospace';
    g.fillText('VB-01', 136, 92);
  }, []);

  // round sensor board: green FR4, gold pads, silkscreen
  const boardTex = useCanvasTexture(256, 256, (g) => {
    g.fillStyle = '#17452f';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#b8963e';
    g.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 70, 128 + Math.sin(a) * 70); g.lineTo(128 + Math.cos(a + 0.3) * 96, 128 + Math.sin(a + 0.3) * 96); g.stroke();
    }
    g.fillStyle = '#d6b45a';
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + 0.3; g.fillRect(124 + Math.cos(a) * 96, 124 + Math.sin(a) * 96, 8, 8); }
    g.fillStyle = '#e4e4e7';
    g.font = '15px monospace';
    g.fillText(kit === 'industrial' ? 'ADXL-CLASS' : 'MPU6050', 84, 214);
    g.fillText('+X  +Y', 92, 52);
  }, [kit]);

  return (
    <Selectable id="vibration" center={along(0.2)} size={[0.3, 0.46, 0.3]} normal={mount.normal}>
      <group position={mount.pos} quaternion={q}>
        {/* ---- static base ---- */}
        {/* spot-faced mounting pad, partly sunk into the curved bearing cap */}
        <Cyl r={0.11} len={0.05} pos={[0, -0.005, 0]} color="#3f3f46" metal={0.6} rough={0.4} seg={32} />
        {/* M6 threaded stud between pad and base */}
        <Cyl r={0.026} len={0.024} pos={[0, 0.03, 0]} color="#9ca3af" metal={0.9} rough={0.32} seg={16} cast={false} />
        {[0, 1, 2].map((i) => <Cyl key={i} r={0.029} len={0.003} pos={[0, 0.022 + i * 0.007, 0]} color="#b4bac2" metal={0.9} rough={0.3} seg={16} cast={false} />)}
        {/* hex base (spanner flats) and internal floor */}
        <HexNut pos={[0, 0.0575, 0]} r={0.095} h={0.035} color="#b9bec6" />
        <Cyl r={0.08} len={0.01} pos={[0, 0.08, 0]} color="#9aa1aa" metal={0.85} rough={0.35} seg={36} cast={false} />

        {/* ---- internal assembly (hidden inside the housing until it lifts) ---- */}
        <mesh position={[0, 0.09, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.069, 0.007, 8, 40]} />
          <meshStandardMaterial color="#4b5563" roughness={0.92} metalness={0} />
        </mesh>
        {[Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6].map((a, i) => (
          <group key={i}>
            <Cyl r={0.006} len={0.03} pos={[Math.cos(a) * 0.05, 0.1, Math.sin(a) * 0.05]} color={BRASS} metal={0.85} rough={0.3} seg={6} cast={false} />
            <Cyl r={0.0065} len={0.003} pos={[Math.cos(a) * 0.05, 0.1235, Math.sin(a) * 0.05]} color="#d4d4d8" metal={0.9} rough={0.3} seg={12} cast={false} />
          </group>
        ))}
        <mesh position={[0, 0.1185, 0]}>
          <cylinderGeometry args={[0.062, 0.062, 0.007, 40]} />
          <meshStandardMaterial attach="material-0" color="#17452f" roughness={0.7} />
          <meshStandardMaterial attach="material-1" map={boardTex} roughness={0.65} metalness={0.1} />
          <meshStandardMaterial attach="material-2" color="#17452f" roughness={0.7} />
        </mesh>
        {/* MEMS QFN with edge pads, decoupling capacitors, 4-pin connector */}
        <Box size={[0.024, 0.006, 0.024]} pos={[0, 0.125, 0]} color="#0f0f10" metal={0.15} rough={0.55} cast={false} />
        <Box size={[0.004, 0.0015, 0.004]} pos={[-0.008, 0.1283, -0.008]} color="#d4d4d8" metal={0.6} rough={0.4} cast={false} />
        {[[0, 0.0135], [0, -0.0135], [0.0135, 0], [-0.0135, 0]].map(([x, z], i) => (
          <Box key={i} size={x === 0 ? [0.02, 0.002, 0.003] : [0.003, 0.002, 0.02]} pos={[x, 0.1225, z]} color="#c9ccd1" metal={0.9} rough={0.3} cast={false} />
        ))}
        {[[0.03, 0.012], [0.03, -0.012], [-0.028, 0.02]].map(([x, z], i) => (
          <Box key={i} size={[0.009, 0.005, 0.0045]} pos={[x, 0.1245, z]} color="#a4865a" metal={0.2} rough={0.6} cast={false} />
        ))}
        <Box size={[0.026, 0.012, 0.01]} pos={[0, 0.128, -0.042]} color="#e7e5e4" metal={0} rough={0.7} cast={false} />

        {/* ---- housing (lifts to reveal the board) ---- */}
        <Explode offset={[0, 0.08, 0]}>
          <Cyl r={0.082} len={0.15} pos={[0, 0.16, 0]} color={STEEL} metal={0.92} rough={0.3} seg={48} roughMap={brushed} />
          {/* knurled grip band between two turned grooves */}
          <instancedMesh ref={knurl} args={[undefined, undefined, N]} position={[0, 0.15, 0]}>
            <boxGeometry args={[0.006, 0.05, 0.008]} />
            <meshStandardMaterial color="#9aa1aa" metalness={0.9} roughness={0.38} />
          </instancedMesh>
          {[0.122, 0.178].map((y) => <Cyl key={y} r={0.0836} len={0.003} pos={[0, y, 0]} color="#5b6068" metal={0.8} rough={0.5} seg={48} cast={false} />)}
          {/* chamfered top bezel and the etched top face */}
          <Cyl r={0.07} r2={0.082} len={0.018} pos={[0, 0.244, 0]} color="#d1d5db" metal={0.92} rough={0.24} seg={48} />
          <mesh position={[0, 0.2532, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.07, 48]} />
            <meshStandardMaterial map={topTex} metalness={0.75} roughness={0.32} />
          </mesh>
          {/* gland nut and heat-shrink strain relief at the conduit exit */}
          <HexNut pos={[0, 0.265, 0]} r={0.03} h={0.022} />
          <Cyl r={0.02} r2={0.028} len={0.105} pos={[0, 0.33, 0]} color="#111113" metal={0} rough={0.85} seg={20} />
          <Cyl r={0.0215} len={0.004} pos={[0, 0.36, 0]} color="#27272a" metal={0} rough={0.8} seg={20} cast={false} />
        </Explode>
      </group>
    </Selectable>
  );
}
