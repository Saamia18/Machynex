import { CONFIG as C } from './config';

export type HealthState = 'NORMAL' | 'EARLY' | 'CRITICAL';
export type PresetName = 'baseline' | 'progressive' | 'shock' | 'critical';
export type SetpointKey = 'massG' | 'currentA' | 'tempC' | 'rpm';
export type LogKind = 'STATE' | 'FILTER' | 'TRIP' | 'RESET' | 'INFO' | 'PACKET';
export type SimEvent = 'trip' | 'reset';
export type VibZone = 'A' | 'B' | 'C' | 'D';

export interface PacketRecord {
  t: number;
  state: HealthState;
  zone: VibZone;
  rpm: number;
  massG: number;
  vib: number;
  current: number;
  temp: number;
  relayClosed: boolean;
}

export interface Setpoints {
  massG: number;
  currentA: number;
  tempC: number;
  rpm: number;
  coupling: boolean;
}

export interface LogLine {
  id: number;
  t: number;
  kind: LogKind;
  text: string;
}

export interface Snapshot {
  t: number;
  state: HealthState;
  stateLabel: string;
  relayClosed: boolean;
  rpm: number;
  massG: number;
  vib: number; // mm/s RMS (measured, windowed)
  vibAccG: number;
  vibBand: 'NORMAL' | 'ADVISORY' | 'CRITICAL';
  vibZone: VibZone;
  current: number;
  temp: number;
  evidence: { vib: boolean; temp: boolean; cur: boolean };
  confidence: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  leadTimeS: number | null;
  shockActive: boolean;
  faultPresent: boolean;
  sp: Setpoints;
}

interface Ramp {
  key: SetpointKey;
  from: number;
  to: number;
  dur: number;
  elapsed: number;
  smooth: boolean;
}

const RANK: Record<HealthState, number> = { NORMAL: 0, EARLY: 1, CRITICAL: 2 };
export const STATE_LABEL: Record<HealthState, string> = {
  NORMAL: 'NORMAL OPERATION',
  EARLY: 'EARLY WARNING',
  CRITICAL: 'CRITICAL / UNSAFE THRESHOLD APPROACHING',
};

/** ISO 10816-style zone bands (illustrative for this rig): A good, B acceptable, C advisory, D unacceptable */
export function vibZone(v: number): VibZone {
  const z = C.vib.zones;
  return v < z[0] ? 'A' : v < z[1] ? 'B' : v < z[2] ? 'C' : 'D';
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** vibration severity (mm/s RMS) for an imbalance mass at a given speed (simple omega^2 model) */
export function vibFromMass(massG: number, rpm: number): number {
  const base = C.vib.floor + (massG - C.massMin) * C.vib.perGram;
  const k = rpm / C.nominalRpm;
  return Math.max(0, base) * k * k;
}

export class Simulator {
  t = 0;
  private acc = 0;
  private rand: () => number;
  private logId = 0;

  sp: Setpoints = {
    massG: C.massDefault,
    currentA: C.currentNominal,
    tempC: C.tempNominal,
    rpm: C.nominalRpm,
    coupling: false,
  };

  // live plant values (read by the 3D scene every frame)
  live: {
    rpm: number;
    vibMeas: number;
    vibTrue: number;
    temp: number;
    current: number;
    massG: number;
    state: HealthState;
    relayClosed: boolean;
    shockActive: boolean;
  } = {
    rpm: C.nominalRpm,
    vibMeas: vibFromMass(C.massDefault, C.nominalRpm),
    vibTrue: vibFromMass(C.massDefault, C.nominalRpm),
    temp: C.tempNominal,
    current: C.currentNominal,
    massG: C.massDefault,
    state: 'NORMAL',
    relayClosed: true,
    shockActive: false,
  };

  state: HealthState = 'NORMAL';
  relayClosed = true;

  private ramps: Ramp[] = [];
  private shockRemaining = 0;
  private vibWindow: number[] = [];
  private vibTrend = vibFromMass(C.massDefault, C.nominalRpm);
  private trendBuf: number[] = [];
  private timers = {
    vib: [0, 0, 0],
    temp: [0, 0, 0],
    cur: [0, 0, 0],
  };
  private cleanTimer = 0;
  private episode = { active: false, start: 0, peak: 0, escalated: false };
  private packetTimer = 0;
  private fftTimer = 0;
  private leadTimeS: number | null = null;
  private evidence = { vib: false, temp: false, cur: false };

  // measured values
  private vibMeas: number = this.live.vibMeas;
  private tempMeas: number = C.tempNominal;
  private curMeas: number = C.currentNominal;

  // histories (ring buffers, 10 s)
  private hVib = new Float32Array(C.histLen);
  private hCur = new Float32Array(C.histLen);
  private hTemp = new Float32Array(C.histLen);
  private hHead = 0;
  private hCount = 0;

  // spectrum
  private spectrum = new Float32Array(C.fftBins);
  private waterfall: Float32Array[] = [];

  private logs: LogLine[] = [];
  private events: SimEvent[] = [];
  private packets: PacketRecord[] = [];
  private eventLog: LogLine[] = [];

  constructor(seed = 1234) {
    this.rand = mulberry32(seed);
    for (let i = 0; i < C.histLen; i++) {
      this.hVib[i] = this.vibMeas;
      this.hCur[i] = this.curMeas;
      this.hTemp[i] = this.tempMeas;
    }
    this.hCount = C.histLen;
    this.computeSpectrum();
    this.log('INFO', 'Digital twin started. Synthetic data only; no hardware connected.');
  }

  // ------------------------------------------------------------------ public API
  step(dtReal: number): void {
    this.acc += Math.min(dtReal, 0.25);
    let guard = 0;
    while (this.acc >= C.tickS && guard < 8) {
      this.acc -= C.tickS;
      this.tick(C.tickS);
      guard++;
    }
  }

  setTarget(key: SetpointKey, value: number): void {
    const lim = {
      massG: [C.massMin, C.massMax],
      currentA: [C.currentMin, C.currentMax],
      tempC: [C.tempMin, C.tempMax],
      rpm: [C.rpmMin, C.rpmMax],
    }[key];
    this.ramps = this.ramps.filter((r) => r.key !== key);
    this.sp[key] = clamp(value, lim[0], lim[1]);
  }

  setCoupling(on: boolean): void {
    this.sp.coupling = on;
    this.log('INFO', `Physical coupling ${on ? 'ON' : 'OFF'} (illustrative: imbalance slightly raises current and temperature).`);
  }

  private ramp(key: SetpointKey, to: number, dur: number, smooth = true): void {
    this.ramps = this.ramps.filter((r) => r.key !== key);
    this.ramps.push({ key, from: this.sp[key], to, dur: Math.max(0.01, dur), elapsed: 0, smooth });
  }

  preset(name: PresetName): void {
    switch (name) {
      case 'baseline':
        this.sp.coupling = false;
        this.ramp('massG', C.massDefault, 1.0);
        this.ramp('currentA', C.currentNominal, 1.0);
        this.ramp('tempC', C.tempNominal, 1.0);
        this.ramp('rpm', C.nominalRpm, 1.0);
        this.log('INFO', 'Preset: Normal Baseline (0.15 g, 1.2 A, 38 C, 1450 rpm).');
        if (!this.relayClosed) this.log('INFO', 'Safety cut-off is still open. Press Reset Relay after the fault is cleared.');
        break;
      case 'progressive':
        this.sp.massG = C.massDefault;
        this.ramps = this.ramps.filter((r) => r.key !== 'massG');
        this.ramp('currentA', C.currentNominal, 0.5);
        this.ramp('tempC', C.tempNominal, 0.5);
        this.ramp('rpm', C.nominalRpm, 0.5);
        this.ramp('massG', 0.65, 8.0, false);
        this.log('INFO', 'Preset: Progressive Unbalance (0.15 g to 0.65 g over 8 s).');
        break;
      case 'shock':
        this.shockRemaining = C.shock.durS;
        this.log('INFO', 'Preset: Transient floor shock injected (300 ms).');
        break;
      case 'critical':
        this.ramp('massG', 1.1, 1.2);
        this.ramp('currentA', 4.4, 1.2);
        this.ramp('tempC', 82, 2.0);
        this.log('INFO', 'Preset: Critical Trip Event (vibration, current and temperature spiking).');
        break;
    }
  }

  injectShock(): void {
    this.preset('shock');
  }

  /** true if the setpoints (at nominal conditions) would still trip the cut-off */
  faultPresent(): boolean {
    return (
      vibFromMass(this.sp.massG, this.sp.rpm) >= C.vib.crit ||
      this.sp.tempC >= C.temp.crit ||
      this.sp.currentA >= C.current.crit
    );
  }

  resetRelay(): { ok: boolean; reason?: string } {
    if (this.relayClosed && this.state !== 'CRITICAL') {
      this.log('RESET', 'Relay is already closed; nothing to reset.');
      return { ok: false, reason: 'already closed' };
    }
    if (this.faultPresent()) {
      const reason = 'critical condition still present; clear the fault (e.g. Normal Baseline) first';
      this.log('RESET', `Reset refused: ${reason}.`);
      return { ok: false, reason };
    }
    this.state = 'NORMAL';
    this.relayClosed = true;
    this.cleanTimer = 0;
    for (const k of ['vib', 'temp', 'cur'] as const) this.timers[k] = [0, 0, 0];
    this.episode = { active: false, start: 0, peak: 0, escalated: false };
    this.events.push('reset');
    this.log('RESET', 'Relay re-engaged (simulated). Motor spinning up.');
    this.syncLive();
    return { ok: true };
  }

  drainLogs(): LogLine[] {
    const out = this.logs;
    this.logs = [];
    return out;
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  getSnapshot(): Snapshot {
    const vib = this.vibMeas;
    const f = this.live.rpm / 60;
    const accG = (vib * 1e-3 * 2 * Math.PI * Math.max(f, 0.01)) / 9.81;
    const n = Number(this.evidence.vib) + Number(this.evidence.temp) + Number(this.evidence.cur);
    const confidence = n === 0 ? 'NONE' : n === 1 ? 'LOW' : n === 2 ? 'MEDIUM' : 'HIGH';
    return {
      t: this.t,
      state: this.state,
      stateLabel: STATE_LABEL[this.state],
      relayClosed: this.relayClosed,
      rpm: this.live.rpm,
      massG: this.live.massG,
      vib,
      vibAccG: accG,
      vibBand: vib >= C.vib.crit ? 'CRITICAL' : vib >= C.vib.warn ? 'ADVISORY' : 'NORMAL',
      vibZone: vibZone(vib),
      current: this.curMeas,
      temp: this.tempMeas,
      evidence: { ...this.evidence },
      confidence,
      leadTimeS: this.leadTimeS,
      shockActive: this.shockRemaining > 0,
      faultPresent: this.faultPresent(),
      sp: { ...this.sp },
    };
  }

  history(): { vib: number[]; cur: number[]; temp: number[] } {
    const vib: number[] = [];
    const cur: number[] = [];
    const temp: number[] = [];
    const n = Math.min(this.hCount, C.histLen);
    for (let i = 0; i < n; i++) {
      const idx = (this.hHead - n + i + C.histLen * 2) % C.histLen;
      vib.push(this.hVib[idx]);
      cur.push(this.hCur[idx]);
      temp.push(this.hTemp[idx]);
    }
    return { vib, cur, temp };
  }

  getSpectrum(): { latest: Float32Array; waterfall: Float32Array[]; f1: number } {
    return { latest: this.spectrum, waterfall: this.waterfall, f1: this.live.rpm / 60 };
  }

  // ------------------------------------------------------------------ internals
  private log(kind: LogKind, text: string): void {
    const line: LogLine = { id: ++this.logId, t: this.t, kind, text };
    this.logs.push(line);
    if (kind !== 'PACKET') {
      this.eventLog.push(line);
      if (this.eventLog.length > C.eventMax) this.eventLog.shift();
    }
  }

  /** full telemetry capture (2 Hz packets) and the event log, for export */
  getCapture(): { packets: PacketRecord[]; events: LogLine[] } {
    return { packets: this.packets.slice(), events: this.eventLog.slice() };
  }

  private randn(): number {
    const u = Math.max(1e-9, this.rand());
    const v = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  private syncLive(): void {
    this.live.state = this.state;
    this.live.relayClosed = this.relayClosed;
    this.live.shockActive = this.shockRemaining > 0;
  }

  private tick(dt: number): void {
    this.t += dt;
    this.advanceRamps(dt);
    this.plant(dt);
    this.measure(dt);
    this.logic(dt);
    this.record(dt);
    this.syncLive();
  }

  private advanceRamps(dt: number): void {
    for (const r of this.ramps) {
      r.elapsed += dt;
      const u = clamp(r.elapsed / r.dur, 0, 1);
      const e = r.smooth ? u * u * (3 - 2 * u) : u;
      this.sp[r.key] = r.from + (r.to - r.from) * e;
    }
    this.ramps = this.ramps.filter((r) => r.elapsed < r.dur);
  }

  private plant(dt: number): void {
    const L = this.live;
    // speed: spins up under power, coasts down with inertial damping after trip
    if (this.relayClosed) {
      L.rpm += (this.sp.rpm - L.rpm) * (1 - Math.exp(-dt / C.spinUpTau));
    } else {
      L.rpm = Math.max(0, L.rpm * Math.exp(-dt / C.spinDownTau) - C.coulombRpmPerS * dt);
      if (L.rpm < 1) L.rpm = 0;
    }
    L.massG = this.sp.massG;
    L.vibTrue = vibFromMass(L.massG, L.rpm);

    const coupVib = this.sp.coupling ? Math.max(0, L.vibTrue - 1.0) : 0;
    const tempTarget = this.sp.tempC + 0.6 * coupVib;
    L.temp += (tempTarget - L.temp) * (1 - Math.exp(-dt / C.tempTau));
    const curTarget = this.relayClosed ? this.sp.currentA + 0.03 * coupVib : 0;
    L.current += (curTarget - L.current) * (1 - Math.exp(-dt / C.currentTau));
  }

  private measure(dt: number): void {
    const L = this.live;
    let shockAdd = 0;
    if (this.shockRemaining > 0) {
      const phase = 1 - this.shockRemaining / C.shock.durS;
      shockAdd = C.shock.peak * Math.sin(Math.PI * clamp(phase, 0, 1));
      this.shockRemaining = Math.max(0, this.shockRemaining - dt);
    }
    const vInst = Math.max(0, L.vibTrue * (1 + 0.035 * this.randn()) + shockAdd);
    this.vibWindow.push(vInst);
    if (this.vibWindow.length > 4) this.vibWindow.shift();
    const ms = this.vibWindow.reduce((s, v) => s + v * v, 0) / this.vibWindow.length;
    this.vibMeas = Math.sqrt(ms);
    L.vibMeas = this.vibMeas;
    this.tempMeas = L.temp + 0.08 * this.randn();
    this.curMeas = Math.max(0, L.current * (1 + 0.02 * this.randn()) + 0.01 * this.randn());

    // slow trend for the illustrative lead-time estimate (EMA, tau 1 s)
    const a = 1 - Math.exp(-dt / 1.0);
    this.vibTrend += (this.vibMeas - this.vibTrend) * a;
    this.trendBuf.push(this.vibTrend);
    if (this.trendBuf.length > 60) this.trendBuf.shift();
    this.updateLeadTime(dt);
  }

  private updateLeadTime(dt: number): void {
    const n = this.trendBuf.length;
    if (n < 40 || this.state === 'CRITICAL') {
      this.leadTimeS = null;
      return;
    }
    // least-squares slope over the last 3 s
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      const x = i * dt;
      const y = this.trendBuf[i];
      sx += x; sy += y; sxx += x * x; sxy += x * y;
    }
    const den = n * sxx - sx * sx;
    const slope = den === 0 ? 0 : (n * sxy - sx * sy) / den;
    if (slope > C.leadTime.minSlope && this.vibTrend < C.vib.crit) {
      const est = (C.vib.crit - this.vibTrend) / slope;
      this.leadTimeS = est <= C.leadTime.maxShownS ? est : null;
    } else {
      this.leadTimeS = null;
    }
  }

  private level(vibCh: number, tempCh: number, curCh: number): [number, number, number] {
    const v = vibCh >= C.vib.crit ? 2 : vibCh >= C.vib.warn ? 1 : 0;
    const t = tempCh >= C.temp.crit ? 2 : tempCh >= C.temp.warn ? 1 : 0;
    const c = curCh >= C.current.crit ? 2 : 0;
    return [v, t, c];
  }

  private logic(dt: number): void {
    const [vL, tL, cL] = this.level(this.vibMeas, this.tempMeas, this.curMeas);
    const lv = { vib: vL, temp: tL, cur: cL };
    const cand = { vib: 0, temp: 0, cur: 0 };
    for (const ch of ['vib', 'temp', 'cur'] as const) {
      for (let L = 1; L <= 2; L++) {
        if (lv[ch] >= L) this.timers[ch][L] += dt;
        else this.timers[ch][L] = 0;
        if (this.timers[ch][L] >= C.persistS[ch]) cand[ch] = L;
      }
    }
    const overall = Math.max(cand.vib, cand.temp, cand.cur);

    // evidence channels (used for corroboration / confidence)
    this.evidence = {
      vib: cand.vib >= 1,
      temp: this.tempMeas >= C.temp.corroborate,
      cur: this.curMeas >= C.current.corroborate,
    };

    // transient vibration episode tracking (for filter log)
    if (this.vibMeas >= C.vib.warn) {
      if (!this.episode.active) {
        this.episode = { active: true, start: this.t, peak: this.vibMeas, escalated: false };
      } else {
        this.episode.peak = Math.max(this.episode.peak, this.vibMeas);
      }
      if (cand.vib >= 1) this.episode.escalated = true;
    } else if (this.episode.active) {
      const dur = this.t - this.episode.start;
      const ep = this.episode;
      this.episode = { active: false, start: 0, peak: 0, escalated: false };
      if (!ep.escalated && dur < C.persistS.vib && this.state !== 'CRITICAL') {
        const corroborated = this.evidence.temp || this.evidence.cur;
        const detail = `peak ${ep.peak.toFixed(1)} mm/s, ${Math.round(dur * 1000)} ms < ${Math.round(C.persistS.vib * 1000)} ms persistence`;
        if (!corroborated) {
          this.log('FILTER', `Transient vibration impulse rejected. Supporting thermal/current corroboration absent. (${detail})`);
        } else {
          this.log('FILTER', `Short vibration excursion below persistence window; no state change. (${detail})`);
        }
      }
    }

    if (this.state === 'CRITICAL') return; // latched until Reset Relay

    const cur = RANK[this.state];
    if (overall > cur) {
      const next: HealthState = overall >= 2 ? 'CRITICAL' : 'EARLY';
      this.transition(next, cand);
      this.cleanTimer = 0;
    } else if (overall < cur) {
      this.cleanTimer += dt;
      if (this.cleanTimer >= C.hysteresisS) {
        const next: HealthState = overall === 0 ? 'NORMAL' : 'EARLY';
        this.log('STATE', `${STATE_LABEL[this.state]} -> ${STATE_LABEL[next]} (clear for ${C.hysteresisS.toFixed(1)} s)`);
        this.state = next;
        this.cleanTimer = 0;
      }
    } else {
      this.cleanTimer = 0;
    }
  }

  private transition(next: HealthState, cand: { vib: number; temp: number; cur: number }): void {
    const why: string[] = [];
    if (cand.vib >= RANK[next]) why.push(`vibration ${this.vibMeas.toFixed(2)} mm/s`);
    if (cand.temp >= RANK[next]) why.push(`stator temp ${this.tempMeas.toFixed(1)} C`);
    if (cand.cur >= RANK[next]) why.push(`current ${this.curMeas.toFixed(2)} A`);
    const n = Number(this.evidence.vib) + Number(this.evidence.temp) + Number(this.evidence.cur);
    const conf = n <= 1 ? 'LOW' : n === 2 ? 'MEDIUM' : 'HIGH';
    this.log(
      'STATE',
      `${STATE_LABEL[this.state]} -> ${STATE_LABEL[next]}: ${why.join(', ') || 'threshold exceeded'} sustained. Evidence ${n}/3, confidence ${conf}.`,
    );
    this.state = next;
    if (next === 'CRITICAL') {
      this.relayClosed = false;
      this.events.push('trip');
      this.log('TRIP', 'Hard safety limit exceeded. Simulated safety cut-off OPEN. Motor spinning down.');
    }
  }

  private record(dt: number): void {
    this.hVib[this.hHead] = this.vibMeas;
    this.hCur[this.hHead] = this.curMeas;
    this.hTemp[this.hHead] = this.tempMeas;
    this.hHead = (this.hHead + 1) % C.histLen;
    this.hCount = Math.min(C.histLen, this.hCount + 1);

    this.fftTimer += dt;
    if (this.fftTimer >= 0.1 - 1e-9) {
      this.fftTimer -= 0.1;
      this.computeSpectrum();
    }
    this.packetTimer += dt;
    if (this.packetTimer >= 0.5 - 1e-9) {
      this.packetTimer -= 0.5;
      const pkt = {
        t: Number(this.t.toFixed(1)),
        rpm: Math.round(this.live.rpm),
        vib_mm_s: Number(this.vibMeas.toFixed(2)),
        i_A: Number(this.curMeas.toFixed(2)),
        temp_C: Number(this.tempMeas.toFixed(1)),
        state: this.state,
        zone: vibZone(this.vibMeas),
        synthetic: true,
      };
      this.packets.push({
        t: pkt.t, state: this.state, zone: pkt.zone, rpm: pkt.rpm, massG: Number(this.live.massG.toFixed(3)),
        vib: pkt.vib_mm_s, current: pkt.i_A, temp: pkt.temp_C, relayClosed: this.relayClosed,
      });
      if (this.packets.length > C.captureMax) this.packets.shift();
      this.log('PACKET', JSON.stringify(pkt));
    }
  }

  private computeSpectrum(): void {
    const N = C.fftBins;
    const df = C.fftMaxHz / N;
    const f1 = this.live.rpm / 60;
    const a1 = this.live.vibTrue;
    const spec = new Float32Array(N);
    const shock = this.shockRemaining > 0 ? 0.5 * Math.sin(Math.PI * clamp(1 - this.shockRemaining / C.shock.durS, 0, 1)) : 0;
    const peak = (f: number, amp: number, sigma: number, i: number): number => {
      const x = (i * df - f) / sigma;
      return amp * Math.exp(-0.5 * x * x);
    };
    for (let i = 0; i < N; i++) {
      let v = 0.015 + 0.02 * Math.abs(this.randn()) + shock;
      if (f1 > 1) {
        const jit = 0.1 * this.randn();
        v += peak(f1 + jit, a1, 0.7, i);
        v += peak(2 * f1, 0.1 * a1 + 0.03, 0.8, i);
        v += peak(3 * f1, 0.04 * a1 + 0.015, 0.9, i);
        v += peak(82, 0.05 + 0.012 * a1, 6, i); // rig-body resonance (illustrative)
      }
      spec[i] = v;
    }
    this.spectrum = spec;
    this.waterfall.push(spec);
    if (this.waterfall.length > C.waterfallLen) this.waterfall.shift();
  }
}
