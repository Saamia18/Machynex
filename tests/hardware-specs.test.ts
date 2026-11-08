import assert from 'node:assert/strict';
import {
  ACS712_05B, DS18B20, HARDWARE_IDS, MLX90614, MPU6050,
  acs712Current, acs712Voltage, adxl345Counts, ds18b20Raw, ds18b20ToC, hex16, inspectorEntry,
  mlx90614Raw, mlx90614ToC, mpu6050Counts, mpu6050ToG, puckAcceleration, sct013Current, sct013Voltage,
} from '../src/sim/hardwareSpecs';
import type { MpuRange, PhysicalInputs } from '../src/sim/hardwareSpecs';
import { SHOT_NAMES, makeShot } from '../src/sim/shots';
import { BENCH_MOUNTS, GLANDS, HARNESS, HARNESS_BENCH_SIGNAL, HARNESS_INDUSTRIAL, glandTip } from '../src/sim/mounts';

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('  ok  ', name); };
const near = (a: number, b: number, eps: number, msg?: string) => assert.ok(Math.abs(a - b) <= eps, msg ?? `${a} != ${b} (±${eps})`);

test('MPU6050: datasheet sensitivities and counts <-> g round trip within 1 LSB', () => {
  assert.deepEqual(MPU6050.lsbPerG, { 2: 16384, 4: 8192, 8: 4096, 16: 2048 });
  assert.equal(MPU6050.i2cAddress, 0x68);
  assert.equal(MPU6050.accelXoutH, 0x3b);
  for (const r of [2, 4, 8, 16] as MpuRange[]) {
    for (const v of [-1.5, -0.25, 0, 0.001, 0.7, 1]) {
      const g = mpu6050ToG(mpu6050Counts({ x: v, y: -v, z: 1 }, r), r);
      near(g.x, v, 1 / MPU6050.lsbPerG[r]);
      near(g.y, -v, 1 / MPU6050.lsbPerG[r]);
    }
  }
  assert.deepEqual(mpu6050Counts({ x: 0, y: 0, z: 1 }, 2), { x: 0, y: 0, z: 16384 });
});

test('MPU6050: saturates at the int16 limits beyond the selected range, never NaN', () => {
  const c = mpu6050Counts({ x: 5, y: -5, z: NaN }, 2);
  assert.equal(c.x, 32767);
  assert.equal(c.y, -32768);
  assert.equal(c.z, 0);
});

test('ADXL345 (concept): counts are integers and clipped to ±16 g', () => {
  const c = adxl345Counts({ x: 100, y: -100, z: 1 });
  assert.equal(c.x, 16 * 256 - 1);
  assert.equal(c.y, -16 * 256);
  assert.equal(c.z, 256);
});

test('DS18B20: datasheet example registers and round trip at 0.0625 C/LSB', () => {
  assert.equal(hex16(ds18b20Raw(125)), '0x07D0');
  assert.equal(hex16(ds18b20Raw(85)), '0x0550');
  assert.equal(hex16(ds18b20Raw(25.0625)), '0x0191');
  assert.equal(hex16(ds18b20Raw(-55)), '0xFC90');
  assert.equal(hex16(ds18b20Raw(0)), '0x0000');
  for (const t of [-55, -10.125, 0, 21.5, 38, 75.0625, 125]) near(ds18b20ToC(ds18b20Raw(t)), t, DS18B20.lsbC / 2);
  assert.equal(ds18b20ToC(0xfc90), -55); // register form (unsigned 16-bit) decodes as negative
  assert.equal(ds18b20ToC(ds18b20Raw(300)), 125); // clamped to range
  assert.equal(ds18b20ToC(ds18b20Raw(NaN)), 25);
});

test('ACS712-05B: VCC/2 at 0 A, 185 mV/A, round trip, rail clipping', () => {
  near(acs712Voltage(0), 2.5, 1e-12);
  near(acs712Voltage(1), 2.5 + 0.185, 1e-12);
  near(acs712Voltage(-5), 2.5 - 0.925, 1e-12);
  for (const i of [-5, -1.2, 0, 1.2, 4.4, 5]) near(acs712Current(acs712Voltage(i)), i, 1e-9);
  near(acs712Voltage(0, 4.5), 2.25, 1e-12); // ratiometric
  assert.equal(acs712Voltage(1000), ACS712_05B.vcc);
  assert.equal(acs712Voltage(-1000), 0);
});

test('SCT-013-030 (concept): 30 A -> 1 V and back; negative input clamps to 0', () => {
  near(sct013Voltage(30), 1, 1e-12);
  near(sct013Current(sct013Voltage(12.3)), 12.3, 1e-9);
  assert.equal(sct013Voltage(-3), 0);
});

test('MLX90614: 0.02 K/LSB, datasheet example 0x27AD = -70.01 C, round trip', () => {
  near(mlx90614ToC(0x27ad), -70.01, 1e-9);
  near(mlx90614ToC(0x3ad2), 28.01, 1e-9); // datasheet SMBus read example result
  for (const t of [-40, 0, 38, 82, 125]) near(mlx90614ToC(mlx90614Raw(t)), t, MLX90614.lsbK / 2 + 1e-9);
  assert.equal(mlx90614Raw(NaN) & 0x8000, 0); // error flag never set by the simulation
  assert.equal(mlx90614ToC(0x8000 | mlx90614Raw(20)), mlx90614ToC(mlx90614Raw(20))); // flag bit ignored in the value
});

test('puck acceleration: 1 g vertical at rest, finite everywhere', () => {
  const base: PhysicalInputs = { t: 0, rpm: 0, vibAccG: 0, current: 0, temp: 25, state: 'NORMAL', relayClosed: true };
  assert.deepEqual(puckAcceleration(base), { x: 0, y: 0, z: 1 });
  for (let t = 0; t < 2; t += 0.037) {
    const a = puckAcceleration({ ...base, t, rpm: 1450, vibAccG: 0.05 });
    assert.ok([a.x, a.y, a.z].every(Number.isFinite));
    assert.ok(Math.abs(a.z - 1) <= 0.05 + 1e-12);
  }
});

test('every inspector entry (both kits) has name, protocol, sampling rate, conversion and a source; raw rows are finite', () => {
  const p: PhysicalInputs = { t: 12.3, rpm: 1450, vibAccG: 0.03, current: 1.2, temp: 38, state: 'NORMAL OPERATION', relayClosed: true };
  for (const kit of ['bench', 'industrial'] as const) {
    for (const id of HARDWARE_IDS) {
      const e = inspectorEntry(id, kit);
      for (const k of ['name', 'part', 'protocol', 'samplingRate', 'conversion', 'source'] as const) assert.ok(e[k].trim().length > 0, `${kit}/${id}: ${k} empty`);
      const rows = e.raw(p);
      assert.ok(rows.length > 0);
      for (const r of rows) assert.ok(!/NaN|Infinity/.test(`${r.dec}${r.hex ?? ''}`), `${kit}/${id}: ${r.label} not finite`);
    }
  }
});

test('honesty: bench kit parts match the proposal; concept parts are flagged; unverified sources are marked', () => {
  assert.equal(inspectorEntry('node', 'bench').concept, false);
  assert.match(inspectorEntry('node', 'bench').part, /ESP32 DevKit V1/);
  assert.match(inspectorEntry('vibration', 'bench').part, /MPU6050/);
  assert.match(inspectorEntry('temperature', 'bench').part, /DS18B20/);
  assert.match(inspectorEntry('current', 'bench').part, /ACS712/);
  assert.doesNotMatch(JSON.stringify(inspectorEntry('current', 'bench')), /SCT-013/); // no AC-only CT on the DC bench kit
  for (const id of HARDWARE_IDS) assert.equal(inspectorEntry(id, 'industrial').concept, true);
  // figures that were not checked against a datasheet must be flagged
  assert.match(inspectorEntry('vibration', 'industrial').source, /NOT verified/);
  assert.match(inspectorEntry('current', 'industrial').source, /NOT verified/);
  assert.ok(inspectorEntry('vibration', 'industrial').specs.some((s) => s.unverified));
  const node = inspectorEntry('node', 'industrial').specs;
  for (const label of ['On-device FFT', 'Cut-off latency']) assert.equal(node.find((s) => s.label === label)?.unverified, true, `${label} must be unverified`);
});

test('camera shots: every name (incl. Phase 2 macro shots) has finite positions and targets', () => {
  for (const n of ['rig', 'nodeMacro', 'puck', 'clamp'] as const) assert.ok(SHOT_NAMES.includes(n), `${n} missing`);
  for (const n of SHOT_NAMES) {
    const s = makeShot(n);
    assert.ok([...s.pos, ...s.target].every(Number.isFinite), n);
  }
});

test('cable harnesses all end at a gland tip; mounts are unit-normal', () => {
  const tips = GLANDS.map((_, i) => glandTip(i));
  const ends = [HARNESS.puck, HARNESS.tempProbe, HARNESS.power, HARNESS_BENCH_SIGNAL, HARNESS_INDUSTRIAL.irTemp, HARNESS_INDUSTRIAL.ctOut].map((h) => h[h.length - 1]);
  for (const e of ends) assert.ok(tips.some((t) => Math.hypot(e[0] - t[0], e[1] - t[1], e[2] - t[2]) < 0.04), `cable end ${e} not at a gland`);
  for (const m of Object.values(BENCH_MOUNTS)) {
    near(Math.hypot(...m.normal), 1, 1e-9);
    near(Math.hypot(...m.axis), 1, 1e-9);
  }
});

console.log(`\n${passed} hardware-spec tests passed`);
