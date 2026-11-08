// Hardware inspector data and raw-reading conversions. Pure functions, unit-tested in tests/hardware-specs.test.ts.
//
// Sources checked in this session (text extracted from the PDFs):
//  [MPU-PS]  InvenSense MPU-6000/MPU-6050 Product Specification, PS-MPU-6000A-00 Rev 3.1 (copy hosted on cdn.sparkfun.com)
//            accel sensitivity 16384/8192/4096/2048 LSB/g for AFS_SEL 0..3 (+-2/4/8/16 g); accelerometer sample rate 1 kHz;
//            I2C 400 kHz fast mode (SPI is MPU-6000 only); I2C address b1101000 (0x68) with AD0 = 0, b1101001 with AD0 = 1.
//  [MPU-RM]  InvenSense MPU-6000/MPU-6050 Register Map and Descriptions Rev 4.0 (cdn.sparkfun.com copy): ACCEL_XOUT_H = 0x3B (59).
//  [DS]      Dallas/Maxim DS18B20 datasheet (cdn.sparkfun.com copy): 12-bit = 0.0625 C/LSB, 750 ms max conversion,
//            -55..+125 C, 3.0-5.5 V, sign-extended two's complement; +125 C = 0x07D0, -55 C = 0xFC90, 0x0550 = 85 C power-on value.
//  [ACS]     Allegro ACS712 datasheet ACS712-DS Rev 22 (allegromicro.com): ELCTR-05B-T +-5 A, sensitivity 185 mV/A (180-190),
//            VIOUT(Q) = 0.5 x VCC at 0 A (ratiometric), VCC 4.5-5.0-5.5 V, 80 kHz bandwidth.
//  [MLX]     Melexis MLX90614 datasheet Rev 021 (melexis.com): SMBus default SA 0x5A, RAM 0x06 = Ta, 0x07 = Tobj1, 0.02 C resolution,
//            MSb of linearised RAM temperatures is an error flag. Check: 0x27AD x 0.02 K = 203.14 K = -70.01 C (datasheet example).
//  [ESP32]   Espressif ESP32 Series Datasheet v5.3: Xtensa dual-core 32-bit LX6, 240 MHz, 520 KB SRAM, 12-bit SAR ADC.
//  [ESP32S3] Espressif ESP32-S3 Series Datasheet v2.2: Xtensa dual-core 32-bit LX7, up to 240 MHz, 512 KB SRAM, two 12-bit SAR ADCs.
// NOT verified in this session (fetch failed): ADXL345 and SCT-013 figures. They are shown as `unverified` in the UI.

import type { SensorKit } from './mounts';

export type HardwareId = 'node' | 'vibration' | 'current' | 'temperature';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finite = (v: number, fallback = 0) => (Number.isFinite(v) ? v : fallback);

/** 16-bit two's complement hex, e.g. -1 -> 0xFFFF */
export function hex16(v: number): string {
  return '0x' + ((Math.round(v) & 0xffff) >>> 0).toString(16).toUpperCase().padStart(4, '0');
}

// ------------------------------------------------------------------ MPU6050 [MPU-PS], [MPU-RM]
export type MpuRange = 2 | 4 | 8 | 16;
export const MPU6050 = {
  i2cAddress: 0x68, // AD0 = 0 [MPU-PS]
  accelXoutH: 0x3b, // [MPU-RM]
  lsbPerG: { 2: 16384, 4: 8192, 8: 4096, 16: 2048 } as Record<MpuRange, number>, // [MPU-PS]
  accelRateHz: 1000, // [MPU-PS]
} as const;

export interface Axes { x: number; y: number; z: number }

/** acceleration in g -> int16 counts for the selected range (saturates at the int16 limits) */
export function mpu6050Counts(g: Axes, range: MpuRange = 2): Axes {
  const k = MPU6050.lsbPerG[range];
  const c = (v: number) => clamp(Math.round(finite(v) * k), -32768, 32767);
  return { x: c(g.x), y: c(g.y), z: c(g.z) };
}
export function mpu6050ToG(counts: Axes, range: MpuRange = 2): Axes {
  const k = MPU6050.lsbPerG[range];
  return { x: counts.x / k, y: counts.y / k, z: counts.z / k };
}

// ------------------------------------------------------------------ ADXL345 (industrial concept; UNVERIFIED)
export const ADXL345 = {
  lsbPerG: 256, // full-resolution ~3.9 mg/LSB: UNVERIFIED
  rangeG: 16, // UNVERIFIED
  odrHz: 1600, // selectable output data rate: UNVERIFIED
} as const;
export function adxl345Counts(g: Axes): Axes {
  const lim = ADXL345.rangeG * ADXL345.lsbPerG;
  const c = (v: number) => clamp(Math.round(finite(v) * ADXL345.lsbPerG), -lim, lim - 1);
  return { x: c(g.x), y: c(g.y), z: c(g.z) };
}

// ------------------------------------------------------------------ DS18B20 [DS]
export const DS18B20 = { lsbC: 0.0625, minC: -55, maxC: 125, conversionMs: 750 } as const;
/** temperature -> 12-bit raw register value (signed integer; use hex16 for the register form) */
export function ds18b20Raw(tempC: number): number {
  return Math.round(clamp(finite(tempC, 25), DS18B20.minC, DS18B20.maxC) / DS18B20.lsbC);
}
export function ds18b20ToC(raw: number): number {
  const s = (raw & 0x8000) ? (raw & 0xffff) - 0x10000 : raw;
  return s * DS18B20.lsbC;
}

// ------------------------------------------------------------------ ACS712ELCTR-05B [ACS]
export const ACS712_05B = { sensVPerA: 0.185, zeroRatio: 0.5, vcc: 5.0, rangeA: 5 } as const;
/** sensor output voltage for a current (ratiometric about VCC/2, clipped to the supply rails) */
export function acs712Voltage(currentA: number, vcc: number = ACS712_05B.vcc): number {
  const sens = ACS712_05B.sensVPerA * (vcc / ACS712_05B.vcc); // ratiometric sensitivity
  return clamp(vcc * ACS712_05B.zeroRatio + sens * finite(currentA), 0, vcc);
}
export function acs712Current(v: number, vcc: number = ACS712_05B.vcc): number {
  const sens = ACS712_05B.sensVPerA * (vcc / ACS712_05B.vcc);
  return (v - vcc * ACS712_05B.zeroRatio) / sens;
}

// ------------------------------------------------------------------ SCT-013-030 (industrial concept; UNVERIFIED)
export const SCT013_030 = { ratedA: 30, ratedV: 1.0 } as const; // 30 A rms -> 1 V rms, internal burden: UNVERIFIED
export function sct013Voltage(currentArms: number): number {
  return Math.max(0, finite(currentArms)) * (SCT013_030.ratedV / SCT013_030.ratedA);
}
export function sct013Current(vrms: number): number {
  return vrms * (SCT013_030.ratedA / SCT013_030.ratedV);
}

// ------------------------------------------------------------------ MLX90614 [MLX]
export const MLX90614 = { address: 0x5a, ramTa: 0x06, ramTobj1: 0x07, lsbK: 0.02 } as const;
/** object temperature -> RAM word (15-bit value; bit 15 is the error flag and is 0 here) */
export function mlx90614Raw(tempC: number): number {
  return clamp(Math.round((finite(tempC, 25) + 273.15) / MLX90614.lsbK), 0, 0x7fff);
}
export function mlx90614ToC(raw: number): number {
  return (raw & 0x7fff) * MLX90614.lsbK - 273.15;
}

// ------------------------------------------------------------------ simulated physical inputs
export interface PhysicalInputs {
  t: number;
  rpm: number;
  vibAccG: number; // peak acceleration at 1X (g)
  current: number; // A
  temp: number; // C
  state: string;
  relayClosed: boolean;
}

/** instantaneous simulated acceleration at the puck: X radial, Y axial, Z vertical (+1 g gravity) */
export function puckAcceleration(p: PhysicalInputs): Axes {
  const ph = 2 * Math.PI * (p.rpm / 60) * p.t;
  return { x: p.vibAccG * Math.sin(ph), y: 0.15 * p.vibAccG * Math.sin(2 * ph), z: 1 + p.vibAccG * Math.cos(ph) };
}

// ------------------------------------------------------------------ inspector entries
export interface SpecRow { label: string; value: string; unverified?: boolean }
export interface RawRow { label: string; hex?: string; dec: string; unit?: string }

export interface InspectorEntry {
  id: HardwareId;
  name: string;
  part: string;
  concept: boolean; // not in the proposed bill of materials
  protocol: string;
  samplingRate: string;
  supply: string;
  role: string;
  conversion: string;
  source: string;
  specs: SpecRow[];
  raw: (p: PhysicalInputs) => RawRow[];
}

const fmt = (v: number, d: number) => finite(v).toFixed(d);
const axesRows = (c: Axes, label: (a: string) => string): RawRow[] =>
  (['x', 'y', 'z'] as const).map((a) => ({ label: label(a), hex: hex16(c[a]), dec: String(c[a]) }));

export function inspectorEntry(id: HardwareId, kit: SensorKit): InspectorEntry {
  const ind = kit === 'industrial';
  switch (id) {
    case 'node':
      return ind
        ? {
            id, name: 'Edge node', part: 'ESP32-S3 module in IP65-style enclosure', concept: true,
            protocol: 'Wi-Fi SoC (2.4 GHz) · I2C / SPI / 1-Wire / ADC to sensors', samplingRate: 'Packets to the dashboard at 2 Hz (simulated)',
            supply: '12 V DC in, on-board regulator (not designed)', role: 'Acquisition, edge thresholding, safety cut-off drive',
            conversion: 'See each sensor', source: '[ESP32S3] Espressif ESP32-S3 Series Datasheet v2.2',
            specs: [
              { label: 'CPU', value: 'Xtensa dual-core 32-bit LX7, up to 240 MHz' },
              { label: 'SRAM', value: '512 KB on-chip' },
              { label: 'ADC', value: 'two 12-bit SAR ADCs' },
              { label: 'On-device FFT', value: 'concept target; not implemented', unverified: true },
              { label: 'Cut-off latency', value: '< 15 ms target; not measured', unverified: true },
              { label: 'Cut-off element', value: 'AC solid-state relay (AC concept machines only)' },
            ],
            raw: nodeRaw,
          }
        : {
            id, name: 'Edge node', part: 'ESP32 DevKit V1 (ESP32-WROOM-32)', concept: false,
            protocol: 'Wi-Fi SoC (2.4 GHz) · I2C / 1-Wire / ADC to sensors', samplingRate: 'Packets to the laptop at 2 Hz (simulated)',
            supply: '12 V adapter, 5 V / 3.3 V regulation on the dev board', role: 'Acquisition only; analytics run on the laptop (Python)',
            conversion: 'See each sensor', source: '[ESP32] Espressif ESP32 Series Datasheet v5.3',
            specs: [
              { label: 'CPU', value: 'Xtensa dual-core 32-bit LX6, 240 MHz' },
              { label: 'SRAM', value: '520 KB' },
              { label: 'ADC', value: '12-bit SAR' },
              { label: 'Enclosure', value: 'IP65-style box: concept, not in the proposed BOM' },
              { label: 'Safety cut-off', value: 'DC-rated switch: concept, not in the proposed BOM' },
            ],
            raw: nodeRaw,
          };
    case 'vibration':
      return ind
        ? {
            id, name: 'Vibration pod', part: 'ADXL345-class tri-axial MEMS in stainless puck', concept: true,
            protocol: 'SPI, 4-wire', samplingRate: `${ADXL345.odrHz} Hz output data rate`,
            supply: '3.3 V from the node', role: 'Bearing-housing vibration (wider band than the bench sensor)',
            conversion: `${ADXL345.lsbPerG} LSB/g (full resolution, ±${ADXL345.rangeG} g)`, source: 'ADXL345 datasheet: NOT verified this session',
            specs: [
              { label: 'Range', value: `±${ADXL345.rangeG} g`, unverified: true },
              { label: 'Scale', value: '≈3.9 mg/LSB', unverified: true },
              { label: 'ODR', value: `${ADXL345.odrHz} Hz`, unverified: true },
              { label: 'Mounting', value: 'M6 stud + magnet base, potted puck, braided conduit' },
            ],
            raw: (p) => axesRows(adxl345Counts(puckAcceleration(p)), (a) => `DATA${a.toUpperCase()}`),
          }
        : {
            id, name: 'Vibration pod', part: 'MPU6050 in a potted stainless puck', concept: false,
            protocol: `I2C · 400 kHz · address 0x${MPU6050.i2cAddress.toString(16).toUpperCase()}`, samplingRate: `${MPU6050.accelRateHz / 1000} kHz accelerometer output rate (target); Nyquist ≈ 500 Hz`,
            supply: '3.3 V from the node', role: 'Main evidence channel: imbalance at 1X',
            conversion: `${MPU6050.lsbPerG[2]} LSB/g at ±2 g (AFS_SEL = 0)`, source: '[MPU-PS] PS-MPU-6000A-00 Rev 3.1; [MPU-RM] Register Map Rev 4.0',
            specs: [
              { label: 'Registers', value: 'ACCEL_XOUT_H 0x3B … ACCEL_ZOUT_L 0x40' },
              { label: 'Ranges', value: '±2 / 4 / 8 / 16 g' },
              { label: 'Puck housing', value: 'potted stainless puck: concept packaging, not in the proposed BOM' },
            ],
            raw: (p) => axesRows(mpu6050Counts(puckAcceleration(p), 2), (a) => `ACCEL_${a.toUpperCase()}OUT`),
          };
    case 'current':
      return ind
        ? {
            id, name: 'Current clamp', part: 'SCT-013-030 split-core current transformer (30 A : 1 V)', concept: true,
            protocol: 'Analog CT (AC only), sampled by the node ADC', samplingRate: 'ADC ≈ 1 kHz target (front end not designed)',
            supply: 'Passive (self-powered CT)', role: 'Non-invasive motor current on one AC lead',
            conversion: `${fmt(1000 * SCT013_030.ratedV / SCT013_030.ratedA, 1)} mV rms per A`, source: 'YHDC SCT-013 product data: NOT verified this session',
            specs: [
              { label: 'Rating', value: '30 A rms → 1 V rms (internal burden)', unverified: true },
              { label: 'AC only', value: 'a CT cannot measure the bench rig’s DC lead' },
              { label: 'Preview', value: 'shown on the DC bench rig for illustration only' },
            ],
            raw: (p) => [
              { label: 'I (simulated, as if AC rms)', dec: fmt(p.current, 2), unit: 'A' },
              { label: 'V out (rms)', dec: fmt(sct013Voltage(p.current) * 1000, 1), unit: 'mV' },
            ],
          }
        : {
            id, name: 'Current sensor', part: 'ACS712ELCTR-05B Hall-effect module (optional)', concept: false,
            protocol: 'Analog, ratiometric to VCC', samplingRate: 'ADC ≈ 1 kHz target',
            supply: '5 V (4.5–5.5 V)', role: 'Optional channel, kept only if a pilot shows a usable signal',
            conversion: `${ACS712_05B.sensVPerA * 1000} mV/A, 0 A = VCC/2`, source: '[ACS] Allegro ACS712-DS Rev 22',
            specs: [
              { label: 'Range', value: '±5 A' },
              { label: 'Bandwidth', value: '80 kHz' },
              { label: '3.3 V ADC conditioning', value: 'not designed yet (output swings around 2.5 V)' },
            ],
            raw: (p) => [
              { label: 'I (simulated)', dec: fmt(p.current, 2), unit: 'A' },
              { label: 'VIOUT', dec: fmt(acs712Voltage(p.current), 3), unit: 'V' },
            ],
          };
    case 'temperature':
      return ind
        ? {
            id, name: 'IR temperature pod', part: 'MLX90614 in an M12 stainless barrel', concept: true,
            protocol: `SMBus · address 0x${MLX90614.address.toString(16).toUpperCase()}`, samplingRate: 'Read on request; refresh set by the device filter settings',
            supply: '3.3 V from the node', role: 'Non-contact stator temperature (drive end)',
            conversion: `${MLX90614.lsbK} K/LSB; T[°C] = raw × 0.02 − 273.15`, source: '[MLX] Melexis MLX90614 datasheet Rev 021',
            specs: [
              { label: 'RAM', value: '0x06 Ta · 0x07 Tobj1' },
              { label: 'Resolution', value: '0.02 °C' },
              { label: 'Error flag', value: 'bit 15 of the temperature word' },
            ],
            raw: (p) => {
              const r = mlx90614Raw(p.temp);
              return [{ label: 'RAM 0x07 Tobj1', hex: hex16(r), dec: String(r) }, { label: 'T object', dec: fmt(mlx90614ToC(r), 2), unit: '°C' }];
            },
          }
        : {
            id, name: 'Temperature probe', part: 'DS18B20 in a stainless sleeve on a clamp band', concept: false,
            protocol: '1-Wire', samplingRate: '≈ 1 Hz (12-bit conversion ≤ 750 ms)',
            supply: '3.0–5.5 V', role: 'Slow trend channel on the motor housing',
            conversion: `${DS18B20.lsbC} °C/LSB (12-bit), two's complement`, source: '[DS] Dallas/Maxim DS18B20 datasheet',
            specs: [
              { label: 'Range', value: '−55 to +125 °C' },
              { label: 'Power-on value', value: '0x0550 (85 °C)' },
            ],
            raw: (p) => {
              const r = ds18b20Raw(p.temp);
              return [{ label: 'Temperature register', hex: hex16(r), dec: String(r) }, { label: 'T', dec: fmt(ds18b20ToC(r), 4), unit: '°C' }];
            },
          };
  }
}

function nodeRaw(p: PhysicalInputs): RawRow[] {
  return [
    { label: 'Health state', dec: p.state },
    { label: 'Cut-off', dec: p.relayClosed ? 'ENERGIZED' : 'TRIPPED' },
    { label: 'Sim clock', dec: fmt(p.t, 1), unit: 's' },
    { label: 'Shaft 1X', dec: fmt(p.rpm / 60, 2), unit: 'Hz' },
  ];
}

export const HARDWARE_IDS: HardwareId[] = ['node', 'vibration', 'current', 'temperature'];
