// Client-side anomaly scoring for the dashboard: an Isolation Forest trained on SYNTHETIC nominal-baseline windows.
//
// What it is: an unsupervised anomaly score (0..1) describing how unlike the baseline the last 1 s of telemetry looks.
// What it is not: failure prediction, a fault classifier, or a validated model. It never drives the safety cut-off;
// the trip stays the deterministic edge threshold in engine.ts. No accuracy figures are claimed.
//
// Isolation Forest: Liu, Ting & Zhou, "Isolation Forest", ICDM 2008. Score s(x) = 2^(-E[h(x)] / c(psi)),
// with one documented deviation: a per-node range check (see pathLength).

import { Simulator } from './engine';
import { CONFIG as C } from './config';
import type { AssetId } from './assets';

export const FEATURE_NAMES = ['RMS (1 s)', 'Peak (1 s)', 'Kurtosis (1 s)', '1X amplitude', '2X amplitude', 'Temp slope'] as const;
export const FEATURE_UNITS = ['mm/s', 'mm/s', '', 'mm/s', 'mm/s', '°C/s'] as const;
export type Features = number[];

const WINDOW = Math.round(1 / C.tickS); // 1 s of the 20 Hz RMS track
const SLOPE_WINDOW = Math.round(5 / C.tickS); // temperature slope over 5 s (the probe is slow and noisy)

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

// ------------------------------------------------------------------ features
export interface FeatureSource {
  history: () => { vib: number[]; temp: number[] };
  getSpectrum: () => { latest: Float32Array; f1: number; maxHz: number };
}

function bandMax(sp: Float32Array, maxHz: number, f: number): number {
  if (f <= 1) return 0;
  const k = Math.round((f / maxHz) * sp.length);
  let m = 0;
  for (let i = Math.max(0, k - 2); i <= Math.min(sp.length - 1, k + 2); i++) m = Math.max(m, sp[i]);
  return m;
}

/** feature vector of the most recent 1 s window (see FEATURE_NAMES) */
export function extractFeatures(src: FeatureSource): Features {
  const h = src.history();
  const v = h.vib.slice(-WINDOW);
  const n = Math.max(1, v.length);
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const rms = Math.sqrt(v.reduce((a, b) => a + b * b, 0) / n);
  const peak = v.reduce((a, b) => Math.max(a, b), 0);
  let m2 = 0, m4 = 0;
  for (const x of v) { const d = x - mean; m2 += d * d; m4 += d * d * d * d; }
  m2 /= n; m4 /= n;
  const kurt = m2 > 1e-12 ? m4 / (m2 * m2) : 3;
  const sp = src.getSpectrum();
  const a1 = bandMax(sp.latest, sp.maxHz, sp.f1);
  const a2 = bandMax(sp.latest, sp.maxHz, 2 * sp.f1);
  // least-squares temperature slope over the last 5 s
  const t = h.temp.slice(-SLOPE_WINDOW);
  let slope = 0;
  if (t.length > 2) {
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    t.forEach((y, i) => { const x = i * C.tickS; sx += x; sy += y; sxx += x * x; sxy += x * y; });
    const den = t.length * sxx - sx * sx;
    slope = den === 0 ? 0 : (t.length * sxy - sx * sy) / den;
  }
  return [rms, peak, kurt, a1, a2, slope].map((x) => (Number.isFinite(x) ? x : 0));
}

// ------------------------------------------------------------------ isolation forest
type Node = { leaf: true; size: number } | { leaf: false; f: number; split: number; lo: number; hi: number; left: Node; right: Node };

/** average path length of an unsuccessful BST search over n points (normalisation term) */
export function cFactor(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  const H = Math.log(n - 1) + 0.5772156649;
  return 2 * H - (2 * (n - 1)) / n;
}

export class IsolationForest {
  private trees: Node[] = [];
  private psi = 0;

  constructor(private nTrees = 100, private sampleSize = 128, private seed = 7) {}

  fit(data: Features[]): this {
    const rand = mulberry32(this.seed);
    this.psi = Math.min(this.sampleSize, data.length);
    const maxDepth = Math.ceil(Math.log2(Math.max(2, this.psi)));
    this.trees = [];
    for (let t = 0; t < this.nTrees; t++) {
      const sample: Features[] = [];
      for (let i = 0; i < this.psi; i++) sample.push(data[Math.floor(rand() * data.length)]);
      this.trees.push(this.build(sample, 0, maxDepth, rand));
    }
    return this;
  }

  private build(xs: Features[], depth: number, maxDepth: number, rand: () => number): Node {
    if (depth >= maxDepth || xs.length <= 1) return { leaf: true, size: xs.length };
    const dims = xs[0].length;
    // pick a feature that still varies in this node
    for (let attempt = 0; attempt < dims * 2; attempt++) {
      const f = Math.floor(rand() * dims);
      let lo = Infinity, hi = -Infinity;
      for (const x of xs) { lo = Math.min(lo, x[f]); hi = Math.max(hi, x[f]); }
      if (hi - lo <= 1e-12) continue;
      const split = lo + rand() * (hi - lo);
      const L = xs.filter((x) => x[f] < split), R = xs.filter((x) => x[f] >= split);
      return { leaf: false, f, split, lo, hi, left: this.build(L, depth + 1, maxDepth, rand), right: this.build(R, depth + 1, maxDepth, rand) };
    }
    return { leaf: true, size: xs.length };
  }

  private pathLength(x: Features, node: Node, depth: number): number {
    if (node.leaf) return depth + cFactor(node.size);
    // Range check (documented deviation from the 2008 paper): splits are drawn inside the node's training range, so a
    // value beyond that range would otherwise be isolated no faster than the most extreme baseline point and the score
    // saturates near the baseline tail. A point clearly outside [lo, hi] (25 % slack, so ordinary noise at the edges of a
    // subsample does not count) on the node's feature is treated as isolated here.
    const v = x[node.f];
    const slack = 0.25 * (node.hi - node.lo);
    if (v < node.lo - slack || v > node.hi + slack) return depth + 1;
    return this.pathLength(x, v < node.split ? node.left : node.right, depth + 1);
  }

  /** anomaly score in (0, 1): ~0.5 or lower looks like the baseline, close to 1 is easy to isolate */
  score(x: Features): number {
    if (!this.trees.length) return 0;
    const mean = this.trees.reduce((a, t) => a + this.pathLength(x, t, 0), 0) / this.trees.length;
    return Math.pow(2, -mean / cFactor(this.psi));
  }
}

// ------------------------------------------------------------------ synthetic baseline + training
/** feature windows from a fresh simulator running the asset's nominal band (small, slow operating variation) */
export function baselineWindows(asset: AssetId, seconds = 150, seed = 101): Features[] {
  const s = new Simulator(seed, asset);
  const P = s.profile;
  const r = mulberry32(seed + 1);
  const out: Features[] = [];
  const ticks = Math.round(seconds / C.tickS);
  for (let i = 0; i < ticks; i++) {
    if (i % Math.round(8 / C.tickS) === 0) {
      // nominal operating band: light residual unbalance / fault-free, ±2 % speed
      s.setTarget('massG', 0.1 + 0.1 * r());
      s.setTarget('severity', 0.04 * r());
      s.setTarget('rpm', P.nominal.rpm * (0.98 + 0.04 * r()));
    }
    s.step(C.tickS);
    if (s.t > 10 && i % 5 === 0) out.push(extractFeatures(s));
  }
  return out;
}

export interface TrainedModel {
  asset: AssetId;
  forest: IsolationForest;
  /** score threshold: max(0.6, 99.5th percentile of HELD-OUT baseline scores + 0.03) */
  threshold: number;
  baselineSamples: number;
}

export function trainModel(asset: AssetId): TrainedModel {
  const data = baselineWindows(asset);
  const forest = new IsolationForest(100, 128, 7).fit(data);
  // calibrate on a separate baseline run (different seed): in-sample scores underestimate the spread of new data
  const held = baselineWindows(asset, 90, 202).map((x) => forest.score(x)).sort((a, b) => a - b);
  const p995 = held[Math.min(held.length - 1, Math.floor(held.length * 0.995))];
  return { asset, forest, threshold: Math.max(0.6, p995 + 0.03), baselineSamples: data.length };
}

// ------------------------------------------------------------------ persistence filter on the score
export const ML_PERSIST_S = 2.0; // > 1 s feature window + 300 ms knock, so a single knock cannot persist
export const ML_CLEAR_S = 2.0;

export interface MlEvent { kind: 'rejected' | 'flagged' | 'cleared'; t: number; text: string }

export interface MlStatus {
  score: number;
  threshold: number;
  above: boolean;
  /** persistent anomaly (score held above threshold for ML_PERSIST_S) */
  flagged: boolean;
  features: Features;
}

export class AnomalyMonitor {
  private aboveFor = 0;
  private belowFor = 0;
  private peak = 0;
  private flagged = false;
  private lastT = -1;
  status: MlStatus;

  constructor(public model: TrainedModel) {
    this.status = { score: 0, threshold: model.threshold, above: false, flagged: false, features: [0, 0, 0, 0, 0, 0] };
  }

  /** feed one evaluation at simulated time t; returns events to log */
  update(features: Features, t: number): MlEvent[] {
    const ev: MlEvent[] = [];
    const dt = this.lastT < 0 || t < this.lastT ? 0 : t - this.lastT;
    this.lastT = t;
    const score = this.model.forest.score(features);
    const thr = this.model.threshold;
    const above = score >= thr;
    if (above) {
      this.aboveFor += dt;
      this.belowFor = 0;
      this.peak = Math.max(this.peak, score);
      if (!this.flagged && this.aboveFor >= ML_PERSIST_S) {
        this.flagged = true;
        ev.push({ kind: 'flagged', t, text: `ML · Persistent anomaly: Isolation Forest score ${score.toFixed(2)} ≥ ${thr.toFixed(2)} for ${ML_PERSIST_S.toFixed(1)} s (unlike the synthetic baseline; not a failure prediction).` });
      }
    } else {
      if (this.aboveFor > 0 && !this.flagged) {
        ev.push({ kind: 'rejected', t, text: `ML · Transient anomaly-score spike rejected by persistence filter (peak ${this.peak.toFixed(2)}, ${Math.round(this.aboveFor * 1000)} ms < ${Math.round(ML_PERSIST_S * 1000)} ms).` });
      }
      this.aboveFor = 0;
      this.peak = 0;
      if (this.flagged) {
        this.belowFor += dt;
        if (this.belowFor >= ML_CLEAR_S) {
          this.flagged = false;
          this.belowFor = 0;
          ev.push({ kind: 'cleared', t, text: `ML · Anomaly score back below ${thr.toFixed(2)} for ${ML_CLEAR_S.toFixed(1)} s.` });
        }
      }
    }
    this.status = { score, threshold: thr, above, flagged: this.flagged, features };
    return ev;
  }
}
