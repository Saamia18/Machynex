// Everything is synthesised with the Web Audio API. No audio files, no external assets.
// Browsers only allow sound after a user gesture, so call unlock() from a click/pointerdown.

interface HumNodes {
  o1: OscillatorNode;
  o2: OscillatorNode;
  lp: BiquadFilterNode;
  g: GainNode;
  lfo: OscillatorNode;
  lfoG: GainNode;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private hum: HumNodes | null = null;
  muted = false;
  alarms = true;

  /** must be called from a user gesture once; safe to call repeatedly */
  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.buildGraph(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private buildGraph(ctx: AudioContext): void {
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.9;
    master.connect(ctx.destination);
    this.master = master;

    const g = ctx.createGain();
    g.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    lp.Q.value = 0.7;
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 80;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 160;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.6;
    o1.connect(lp);
    o2.connect(o2g).connect(lp);
    lp.connect(g).connect(master);

    // amplitude modulation at the shaft rotation frequency gives an unbalance "rumble"
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 24;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0;
    lfo.connect(lfoG).connect(g.gain);

    o1.start();
    o2.start();
    lfo.start();
    this.hum = { o1, o2, lp, g, lfo, lfoG };
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
  }

  /** call every frame: hum pitch follows rpm and falls smoothly during spin-down */
  setMotor(rpm: number, vib: number): void {
    if (!this.ctx || !this.hum) return;
    const t = this.ctx.currentTime;
    const h = this.hum;
    const f = 40 + (115 * Math.min(rpm, 2200)) / 1450;
    const running = Math.min(1, rpm / 250);
    const level = this.muted ? 0 : running * (0.05 + 0.006 * Math.min(vib, 9));
    h.o1.frequency.setTargetAtTime(f, t, 0.06);
    h.o2.frequency.setTargetAtTime(f * 2.01, t, 0.06);
    h.lp.frequency.setTargetAtTime(280 + f * 4, t, 0.1);
    h.g.gain.setTargetAtTime(level, t, 0.08);
    h.lfo.frequency.setTargetAtTime(Math.max(1, rpm / 60), t, 0.1);
    h.lfoG.gain.setTargetAtTime(level * 0.28 * Math.min(1, vib / 4), t, 0.1);
  }

  private noiseBurst(when: number, dur: number, gain: number, hp: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-6 * (i / n));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start(when);
  }

  private tone(when: number, f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'sine'): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, when);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(this.master);
    o.start(when);
    o.stop(when + dur + 0.02);
  }

  /** mechanical relay: two distinct clicks (armature, then contact clack) */
  relay(kind: 'trip' | 'reset'): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    if (kind === 'trip') {
      this.noiseBurst(t, 0.035, 0.9, 1800);
      this.tone(t, 150, 48, 0.16, 0.7);
      this.noiseBurst(t + 0.09, 0.045, 1.0, 900);
      this.tone(t + 0.09, 95, 40, 0.2, 0.8);
    } else {
      this.noiseBurst(t, 0.03, 0.6, 2200);
      this.tone(t, 220, 100, 0.08, 0.4);
      this.noiseBurst(t + 0.11, 0.03, 0.55, 2000);
      this.tone(t + 0.11, 180, 90, 0.09, 0.4);
    }
  }

  /** intermittent warning beeps: single for Early Warning, double and higher for Critical */
  beep(kind: 'warn' | 'crit'): void {
    if (this.muted || !this.alarms || !this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    if (kind === 'warn') {
      this.tone(t, 660, 660, 0.15, 0.16, 'triangle');
    } else {
      this.tone(t, 1040, 1040, 0.11, 0.22, 'square');
      this.tone(t + 0.16, 1040, 1040, 0.11, 0.22, 'square');
    }
  }
}
