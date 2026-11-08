import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Info, RotateCcw } from 'lucide-react';
import type { HealthState, LogLine, PresetName, SetpointKey, Simulator, Snapshot } from '../sim/engine';
import { CONFIG as C } from '../sim/config';
import { SpectrumChart, StripCharts } from './Charts';
import { RadialGauge } from './RadialGauge';
import { ASSETS, ASSET_IDS, CONCEPT_ASSET_TAG, gmfHz } from '../sim/assets';
import type { AssetId, AssetProfile } from '../sim/assets';
import { FEATURE_NAMES, FEATURE_UNITS, ML_PERSIST_S } from '../sim/dashboardML';
import type { AnomalyView } from '../sim/useAnomaly';
import { buildCsv, buildJson, downloadText, stamp } from '../sim/exporter';
import type { SensorKit } from '../sim/mounts';
import { HARDWARE_IDS, inspectorEntry } from '../sim/hardwareSpecs';
import type { HardwareId } from '../sim/hardwareSpecs';

type Tone = 'ok' | 'warn' | 'crit' | undefined;
const TONE_TEXT: Record<'ok' | 'warn' | 'crit', string> = { ok: 'text-ok', warn: 'text-warn', crit: 'text-crit' };
const STATE_TONE: Record<HealthState, 'ok' | 'warn' | 'crit'> = { NORMAL: 'ok', EARLY: 'warn', CRITICAL: 'crit' };
const DOT: Record<'ok' | 'warn' | 'crit', string> = { ok: 'bg-ok', warn: 'bg-warn', crit: 'bg-crit' };

export const CUTOFF_TOOLTIP = 'Safety cut-off. Concept add-on, not in the proposed bill of materials.';

function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`text-[11px] font-medium uppercase tracking-wider text-zinc-500 ${className}`}>{children}</div>;
}

function Section({ title, children, right, id }: { title: string; children: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-3 rounded-md border border-line bg-panel">
      <div className="flex min-h-[36px] items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h3 className="text-xs font-medium text-zinc-300">{title}</h3>
        {right}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

// ------------------------------------------------------------------ health banner
/** headline shown in the banner: a latched trip is named explicitly so a falling post-trip reading is not read as recovery */
export function healthHeadline(snap: Pick<Snapshot, 'state' | 'stateLabel' | 'relayClosed'>): { headline: string; detail: string | null } {
  if (snap.state === 'CRITICAL' && !snap.relayClosed) {
    return { headline: 'CRITICAL TRIP (INTERLOCK LATCHED)', detail: 'Critical / Unsafe Threshold Approaching · latched until reset' };
  }
  return { headline: snap.stateLabel, detail: null };
}

export function HealthBanner({ snap }: { snap: Snapshot }) {
  const tone = STATE_TONE[snap.state];
  const ev = snap.evidence;
  const { headline, detail } = healthHeadline(snap);
  const chip = (on: boolean, label: string) => (
    <span className={`font-mono rounded-sm border px-1.5 py-px text-[10px] uppercase ${on ? 'border-zinc-600 bg-zinc-800 text-zinc-100' : 'border-line text-zinc-600'}`}>
      {label}
    </span>
  );
  return (
    <div className="rounded-md border border-line bg-panel" role="status" aria-live="polite">
      <div className="flex items-start gap-3 px-3 pt-3">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} />
        <div className="min-w-0 flex-1">
          <Label>Machine health</Label>
          <div className={`mt-0.5 text-[15px] font-semibold leading-snug ${TONE_TEXT[tone]}`}>{headline}</div>
          {detail && <div className="mt-0.5 text-[11px] text-zinc-400">{detail}</div>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line px-3 py-2 text-[11px] text-zinc-500">
        <span className="flex flex-wrap items-center gap-1">
          <span className="mr-0.5">Evidence</span>
          {chip(ev.vib, 'vib')}
          {chip(ev.temp, 'temp')}
          {chip(ev.cur, 'current')}
        </span>
        <span>Confidence <span className="font-mono text-zinc-200">{snap.confidence}</span></span>
        <span className="font-mono ml-auto text-zinc-600">persist {C.persistS.vib.toFixed(1)} s · hyst {C.hysteresisS.toFixed(1)} s</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ interlock
export function InterlockCard({ sim, snap, onUserGesture }: { sim: Simulator; snap: Snapshot; onUserGesture: () => void }) {
  const [resetMsg, setResetMsg] = useState('');
  useEffect(() => { if (snap.relayClosed) setResetMsg(''); }, [snap.relayClosed]);
  const energized = snap.relayClosed;
  // after a trip: step 1 = clear the fault (Nominal), step 2 = Reset Interlock (pulses once the fault is cleared)
  const readyToReset = !energized && !snap.faultPresent;
  const reset = () => {
    onUserGesture();
    const r = sim.resetRelay();
    setResetMsg(r.ok ? '' : r.reason ?? '');
  };
  return (
    <div className={`rounded-md border bg-panel ${energized ? 'border-line' : 'border-crit/50'}`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <Label className="flex items-center gap-1">
            <span title={CUTOFF_TOOLTIP}>SSR interlock · concept</span>
            <span title={CUTOFF_TOOLTIP} aria-label={CUTOFF_TOOLTIP}><Info size={11} /></span>
          </Label>
          <div className="mt-1 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${energized ? 'bg-ok' : 'bg-crit'}`} />
            <span className={`font-mono text-sm font-semibold ${energized ? 'text-ok' : 'text-crit'}`}>{energized ? 'ENERGIZED' : 'TRIPPED'}</span>
            <span className="text-[11px] text-zinc-500">{energized ? 'motor powered' : 'latched open · motor stopped'}</span>
          </div>
          <div className="mt-1 text-[10px] text-zinc-600">{sim.profile.scope === 'proposal' ? 'DC-rated solid-state switch' : 'AC solid-state relay'} · not in the proposed bill of materials</div>
        </div>
        <button
          onClick={reset}
          disabled={energized}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${readyToReset ? 'mx-attention border-warn font-semibold text-zinc-50' : 'border-line text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'}`}
        >
          <RotateCcw size={12} />Reset Interlock
        </button>
      </div>
      {!energized && (
        <div className="border-t border-line px-3 py-2.5" role="alert">
          {snap.faultPresent ? (
            <div className="rounded-sm border border-warn bg-warn/10 px-2.5 py-2 text-[12px] font-semibold leading-snug text-zinc-50">
              <span className="font-mono mr-1.5 text-warn">1</span>Click <span className="font-mono rounded-sm bg-zinc-800 px-1">Nominal</span> to clear the fault
              <span className="mx-1.5 text-warn">→</span>
              <span className="font-mono mr-1.5 text-zinc-500">2</span>then <span className="font-mono rounded-sm bg-zinc-800 px-1">Reset Interlock</span>
            </div>
          ) : (
            <div className="rounded-sm border border-ok/60 bg-ok/10 px-2.5 py-2 text-[12px] font-semibold leading-snug text-zinc-50">
              <span className="font-mono mr-1.5 text-ok">✓</span>Fault cleared <span className="mx-1.5 text-ok">→</span>click <span className="font-mono rounded-sm bg-zinc-800 px-1">Reset Interlock</span> to re-energize the motor
            </div>
          )}
          {resetMsg && <div className="mt-1.5 text-[11px] text-crit">Last attempt refused: {resetMsg}.</div>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ metrics 2x2
function Metric({ label, value, unit, tone, sub }: { label: string; value: string; unit: string; tone?: Tone; sub?: ReactNode }) {
  const col = tone && tone !== 'ok' ? TONE_TEXT[tone] : 'text-zinc-100';
  return (
    <div className="bg-panel px-3 py-2.5">
      <Label>{label}</Label>
      <div className={`font-mono mt-1 text-2xl leading-none ${col}`}>
        {value}<span className="ml-1 text-xs text-zinc-500">{unit}</span>
      </div>
      {sub && <div className="font-mono mt-1.5 truncate text-[10px] text-zinc-500">{sub}</div>}
    </div>
  );
}

const level = (v: number, warn: number | null, crit: number): Tone => (v >= crit ? 'crit' : warn !== null && v >= warn ? 'warn' : 'ok');

export function MetricsGrid({ snap, profile }: { snap: Snapshot; profile: AssetProfile }) {
  const th = profile.th;
  const fault = profile.faultControl === 'mass' ? `mass ${snap.massG.toFixed(2)} g` : `severity ${snap.sp.severity.toFixed(2)}`;
  const gmf = gmfHz(profile, snap.rpm);
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line">
      <Metric label="Vibration RMS" value={snap.vib.toFixed(2)} unit="mm/s" tone={level(snap.vib, th.vibWarn, th.vibCrit)} sub={`${fault} · zone ${snap.vibZone}`} />
      <Metric label="Motor current" value={snap.current.toFixed(2)} unit="A" tone={level(snap.current, null, th.curCrit)} sub={profile.scope === 'proposal' ? 'optional · ACS712-type' : 'SCT-013 clamp (concept)'} />
      <Metric label="Temperature" value={snap.temp.toFixed(1)} unit="°C" tone={level(snap.temp, th.tempWarn, th.tempCrit)} sub={profile.scope === 'proposal' ? 'DS18B20 · time-compressed' : 'MLX90614 IR (concept)'} />
      <Metric label="Rotational speed" value={Math.round(snap.rpm).toString()} unit="rpm" sub={gmf ? `1X ${(snap.rpm / 60).toFixed(2)} Hz · GMF ${gmf.toFixed(0)} Hz` : `1X ${(snap.rpm / 60).toFixed(2)} Hz`} />
    </div>
  );
}

// ------------------------------------------------------------------ controls (asset, presets, time dilation, setpoints)
function Slider({ label, unit, k, min, max, step, value, onChange, decimals = 2, hint }: { label: string; unit: string; k: SetpointKey; min: number; max: number; step: number; value: number; onChange: (k: SetpointKey, v: number) => void; decimals?: number; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-100">{value.toFixed(decimals)}<span className="ml-1 text-zinc-500">{unit}</span></span>
      </div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(k, Number(e.target.value))} aria-label={label} />
      {hint && <div className="font-mono mt-1.5 text-[10px] text-zinc-600">{hint}</div>}
    </label>
  );
}

const FAULT_SHORT: Record<AssetId, string> = {
  'bench-dc': 'Imbalance', 'induction-05hp': 'Imbalance', 'slurry-pump': 'Cavitation', 'helical-gearbox': 'Pitting',
};

export function presetButtons(asset: AssetId): { id: PresetName; label: string }[] {
  return [
    { id: 'baseline', label: 'Nominal' },
    { id: 'progressive', label: FAULT_SHORT[asset] },
    { id: 'shock', label: 'Transient Knock' },
    { id: 'critical', label: 'Critical Fault' },
  ];
}
/** kept for Phase 1/2 callers: the bench rig's labels */
export const PRESET_BUTTONS = presetButtons('bench-dc');

const ASSET_LABEL: Record<AssetId, string> = {
  'bench-dc': 'Bench rig', 'induction-05hp': 'Induction motor', 'slurry-pump': 'Slurry pump', 'helical-gearbox': 'Helical gearbox',
};

interface ControlsProps {
  sim: Simulator;
  snap: Snapshot;
  onUserGesture: () => void;
  slowMo: number;
  onSlowMo: (v: number) => void;
  onAsset: (id: AssetId) => void;
}

export function Controls({ sim, snap, onUserGesture, slowMo, onSlowMo, onAsset }: ControlsProps) {
  const P = sim.profile;
  const set = (k: SetpointKey, v: number) => sim.setTarget(k, v);
  const preset = (p: PresetName) => { onUserGesture(); sim.preset(p); };
  // after a trip with the fault still set, "Nominal" is the first step of the recovery path
  const nominalFirst = !snap.relayClosed && snap.faultPresent;
  const L = P.limits;
  const th = P.th;
  return (
    <div className="space-y-4">
      <div>
        <Label className="mb-1.5">Machine</Label>
        <div className="grid grid-cols-2 overflow-hidden rounded-md border border-line sm:grid-cols-4" role="group" aria-label="Machine">
          {ASSET_IDS.map((id, i) => (
            <button
              key={id}
              onClick={() => { onUserGesture(); onAsset(id); }}
              aria-pressed={snap.asset === id}
              title={ASSETS[id].name}
              className={`h-8 px-2 text-xs transition-colors ${i > 0 ? 'border-l border-line' : ''} ${i === 2 ? 'max-sm:border-l-0 max-sm:border-t' : ''} ${i === 3 ? 'max-sm:border-t' : ''} ${snap.asset === id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}
            >
              {ASSET_LABEL[id]}
            </button>
          ))}
        </div>
        <div className="mt-1.5 text-[11px] leading-snug text-zinc-500">
          {P.scope === 'proposal'
            ? <>Proposal scope · fault model: {P.faultName}</>
            : <><span className="font-mono text-warn">{CONCEPT_ASSET_TAG}</span> · {P.faultName}. {P.conceptNote}</>}
        </div>
      </div>

      <div>
        <Label className="mb-1.5">Diagnostic presets</Label>
        <div className="grid grid-cols-2 overflow-hidden rounded-md border border-line sm:grid-cols-4" role="group" aria-label="Diagnostic presets">
          {presetButtons(P.id).map((p, i) => (
            <button
              key={p.id}
              onClick={() => preset(p.id)}
              className={`h-8 px-2 text-xs transition-colors ${i > 0 ? 'border-l border-line' : ''} ${i === 2 ? 'max-sm:border-l-0 max-sm:border-t' : ''} ${i === 3 ? 'max-sm:border-t' : ''} ${p.id === 'baseline' && nominalFirst ? 'bg-warn/15 font-semibold text-zinc-50 outline outline-1 -outline-offset-1 outline-warn' : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <div className="mb-2 flex items-baseline justify-between text-xs">
          <span className="text-zinc-400">Visual slow-motion</span>
          <span className="font-mono text-zinc-100">{slowMo.toFixed(2)}×</span>
        </div>
        <input type="range" className="w-full" min={0.01} max={1} step={0.01} value={slowMo} onChange={(e) => onSlowMo(Number(e.target.value))} aria-label="Visual slow-motion" />
        <div className="mt-1.5 text-[10px] text-zinc-600">Slows only how rotation is drawn (real speed strobes on a 60 Hz screen). Physics and readouts run in real time.</div>
      </label>

      <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
        {P.faultControl === 'mass'
          ? <Slider label="Eccentric mass" unit="g" k="massG" min={C.massMin} max={C.massMax} step={0.01} value={snap.sp.massG} onChange={set} hint="0.05 g → 0.5 · 1.5 g → 8.0 mm/s" />
          : <Slider label={`Fault severity · ${FAULT_SHORT[P.id].toLowerCase()}`} unit="" k="severity" min={0} max={1} step={0.01} value={snap.sp.severity} onChange={set} hint="0 = healthy · 1 = severe (illustrative)" />}
        <Slider label="Speed setpoint" unit="rpm" k="rpm" min={L.rpm[0]} max={L.rpm[1]} step={10} value={snap.sp.rpm} onChange={set} decimals={0} hint={`nominal ${P.nominal.rpm} · vibration ∝ rpm²`} />
        <Slider label="Motor current" unit="A" k="currentA" min={L.current[0]} max={L.current[1]} step={0.05} value={snap.sp.currentA} onChange={set} hint={`nominal ${P.nominal.current} A · trip > ${th.curCrit} A`} />
        <Slider label="Temperature" unit="°C" k="tempC" min={L.temp[0]} max={L.temp[1]} step={0.5} value={snap.sp.tempC} onChange={set} decimals={1} hint={`advisory ${th.tempWarn}–${th.tempCrit} · trip > ${th.tempCrit} °C`} />
      </div>
      {P.id === 'bench-dc' && (
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
          <input type="checkbox" checked={snap.sp.coupling} onChange={(e) => sim.setCoupling(e.target.checked)} />
          Physical coupling (illustrative): imbalance slightly raises current and temperature
        </label>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ client-side anomaly score
export function AnomalyPanel({ ml }: { ml: AnomalyView }) {
  const st = ml.status;
  const thr = ml.model?.threshold ?? 0.6;
  const word = !st ? (ml.training ? 'TRAINING' : '—') : st.flagged ? 'PERSISTENT ANOMALY' : st.above ? 'ABOVE THRESHOLD · transient' : 'BASELINE-LIKE';
  const tone = !st ? 'text-zinc-400' : st.flagged ? 'text-warn' : st.above ? 'text-zinc-100' : 'text-ok';
  const pct = (v: number) => `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="font-mono text-2xl leading-none text-zinc-100">{st ? st.score.toFixed(2) : '—'}</div>
          <div className="mt-1 text-[10px] text-zinc-500">score 0–1 · threshold <span className="font-mono">{thr.toFixed(2)}</span></div>
        </div>
        <div className={`font-mono text-right text-[11px] ${tone}`}>{word}</div>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-sm bg-zinc-800">
        <div className={`h-full ${st?.flagged ? 'bg-warn' : 'bg-zinc-400'}`} style={{ width: pct(st?.score ?? 0) }} />
        <div className="absolute inset-y-0 w-px bg-zinc-100" style={{ left: pct(thr) }} />
      </div>
      {st && (
        <div className="font-mono grid grid-cols-3 gap-x-3 gap-y-1 text-[10px]">
          {FEATURE_NAMES.map((n, i) => (
            <div key={n} className="flex justify-between gap-1 text-zinc-500">
              <span className="truncate font-sans">{n}</span>
              <span className="text-zinc-300">{st.features[i].toFixed(i === 5 ? 3 : 2)}{FEATURE_UNITS[i] ? ` ${FEATURE_UNITS[i]}` : ''}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] leading-snug text-zinc-500">
        Isolation Forest (100 trees) trained in the browser on {ml.model?.baselineSamples ?? '…'} synthetic nominal-baseline windows for this machine.
        A score must stay above the threshold for {ML_PERSIST_S.toFixed(1)} s to count, so single knocks are rejected and logged.
        It is an anomaly score, not a failure prediction or a fault classifier; it never drives the cut-off, and no accuracy is claimed.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ lead time
export function LeadTime({ snap, crit = C.vib.crit }: { snap: Snapshot; crit?: number }) {
  const v = snap.leadTimeS;
  return (
    <div className="flex items-start gap-4">
      <div className="font-mono w-20 shrink-0 text-2xl leading-none text-zinc-100">{v === null ? '—' : v < 1 ? '< 1 s' : `~${Math.round(v)} s`}</div>
      <div className="text-[11px] leading-snug text-zinc-500">
        <div className="font-mono text-warn">ILLUSTRATIVE TREND ESTIMATE — SYNTHETIC DATA</div>
        <div className="mt-0.5">Linear extrapolation of the recent vibration slope to the {crit} mm/s limit. It describes a staged ramp in this simulation. It is not remaining useful life and not a prediction of failure.</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ terminal
const KIND_STYLE: Record<string, string> = {
  STATE: 'text-warn', FILTER: 'text-zinc-200', TRIP: 'text-crit', RESET: 'text-ok', INFO: 'text-zinc-400', PACKET: 'text-zinc-600',
};

export function EdgeTerminal({ logs, sim }: { logs: LogLine[]; sim: Simulator }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [hidePackets, setHidePackets] = useState(false);
  const shown = (hidePackets ? logs.filter((l) => l.kind !== 'PACKET') : logs).slice(-120);
  useEffect(() => {
    if (follow && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [shown.length, follow]);
  const btn = 'font-mono rounded-sm border border-line px-1.5 py-px text-[10px] text-zinc-300 hover:bg-zinc-900';
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-end gap-3 text-[11px] text-zinc-500">
        <span className="mr-auto flex items-center gap-1.5">
          Export
          <button className={btn} onClick={() => downloadText(`machynex-synthetic-telemetry-${stamp()}.json`, buildJson(sim.getCapture()), 'application/json')}>JSON</button>
          <button className={btn} onClick={() => downloadText(`machynex-synthetic-telemetry-${stamp()}.csv`, buildCsv(sim.getCapture(), { includeAsset: true }), 'text/csv')}>CSV</button>
        </span>
        <label className="flex cursor-pointer items-center gap-1"><input type="checkbox" checked={hidePackets} onChange={(e) => setHidePackets(e.target.checked)} />events only</label>
        <label className="flex cursor-pointer items-center gap-1"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />auto-scroll</label>
      </div>
      <div ref={boxRef} className="scroll-thin font-mono h-56 overflow-y-auto rounded-sm border border-line bg-canvas p-2 text-[11px] leading-relaxed">
        {shown.map((l) => (
          <div key={l.id} className={KIND_STYLE[l.kind] ?? 'text-zinc-400'}>
            <span className="text-zinc-600">{l.t.toFixed(1).padStart(6, ' ')}s </span>
            {l.kind === 'PACKET' ? l.text : <><span className="font-semibold">[{l.kind}]</span> {l.text}</>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ hardware list (keyboard access to the inspector)
export function HardwareList({ kit, onInspect }: { kit: SensorKit; onInspect: (id: HardwareId) => void }) {
  return (
    <div className="divide-y divide-line">
      {HARDWARE_IDS.map((id) => {
        const e = inspectorEntry(id, kit);
        return (
          <button key={id} onClick={() => onInspect(id)} className="flex w-full items-center gap-3 px-1 py-2 text-left transition-colors hover:bg-zinc-900">
            <span className="w-28 shrink-0 text-xs text-zinc-200">{e.name}</span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-500">{e.part}</span>
            {e.concept && <span className="font-mono shrink-0 text-[10px] text-warn">CONCEPT</span>}
            <span className="font-mono shrink-0 text-[10px] text-zinc-600">{e.protocol.split(' ·')[0]}</span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ about
export function About() {
  const [open, setOpen] = useState(false);
  return (
    <Section title="What this is, and what it is not" right={<button className="text-[11px] text-zinc-400 hover:text-zinc-100" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>}>
      <p className="text-xs text-zinc-400">A concept visualisation for the Machynex proposal. Every value is synthetic and no hardware is connected.</p>
      {open && (
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[11px] leading-snug text-zinc-400">
          <li>The bench rig matches the proposal: 12 V DC motor (775-class), MPU6050 accelerometer, DS18B20 temperature probe, optional ACS712-type current module, ESP32 acquisition node. The safety cut-off and indicator LEDs are a concept add-on and are not in the current bill of materials.</li>
          <li>The induction motor, slurry pump and helical gearbox are concept assets: illustrative fault models that have not been validated. They show how the same node and detection logic could scale, not something that was built or measured.</li>
          <li>All thresholds are illustrative placeholders. Real limits would be set from baseline runs on a real machine. ISO 20816 vibration zones apply to larger machines (the 20816-3 part covers machines above 15 kW), so no ISO zone is claimed here.</li>
          <li>Detection logic mirrors the proposal: persistence ({C.persistS.vib.toFixed(1)} s), hysteresis ({C.hysteresisS.toFixed(1)} s), sensor agreement shown as confidence, and a hard vibration limit that corroboration never suppresses. The 300 ms knock is rejected because it is shorter than the persistence window and has no thermal/current support.</li>
          <li>The anomaly score is computed in the browser by an Isolation Forest trained on synthetic baseline windows. It is not failure prediction and does not drive the cut-off.</li>
          <li>Spectra are generated analytically. Gearbox tooth counts are assumed. Real cavitation energy extends above the proposed sensor's ~500 Hz bandwidth.</li>
          <li>The trend estimate is a straight-line extrapolation of a staged ramp. It is not remaining useful life.</li>
        </ul>
      )}
    </Section>
  );
}

interface PaneProps {
  sim: Simulator;
  snap: Snapshot;
  logs: LogLine[];
  onUserGesture: () => void;
  slowMo: number;
  onSlowMo: (v: number) => void;
  kit: SensorKit;
  onInspect: (id: HardwareId) => void;
  onAsset: (id: AssetId) => void;
  ml: AnomalyView;
  walkScene: number;
}

export function DashboardPane({ sim, snap, logs, onUserGesture, slowMo, onSlowMo, kit, onInspect, onAsset, ml, walkScene }: PaneProps) {
  const P = sim.profile;
  return (
    <div className="space-y-3 p-3">
      <div id="sec-health" className="scroll-mt-3 space-y-3">
        <HealthBanner snap={snap} />
        <InterlockCard sim={sim} snap={snap} onUserGesture={onUserGesture} />
        <RadialGauge snap={snap} th={P.th} />
        <MetricsGrid snap={snap} profile={P} />
      </div>
      <Section title="Simulation & fault injection">
        <Controls sim={sim} snap={snap} onUserGesture={onUserGesture} slowMo={slowMo} onSlowMo={onSlowMo} onAsset={onAsset} />
      </Section>
      <Section title="Anomaly score" right={<span className="font-mono text-[10px] text-zinc-600">client-side · Isolation Forest · synthetic baseline</span>}>
        <AnomalyPanel ml={ml} />
      </Section>
      <Section id="sec-spectrum" title="Vibration spectrum" right={<span className="font-mono text-[10px] text-zinc-600">0–{P.spectrum.maxHz} Hz · synthetic</span>}>
        <SpectrumChart sim={sim} highlight={walkScene === 2} />
        {P.spectrum.model === 'cavitation' && <p className="mt-2 text-[10px] leading-snug text-zinc-500">Concept — needs a wider-bandwidth sensor: real cavitation energy extends well above the ~500 Hz bandwidth of the proposed MPU6050.</p>}
        {P.spectrum.model === 'pitting' && <p className="mt-2 text-[10px] leading-snug text-zinc-500">GMF = pinion teeth × shaft Hz with {P.gear!.pinionTeeth} pinion teeth (assumed, illustrative). Axis 0–500 Hz stays below the ~500 Hz Nyquist of a 1 kHz sensor.</p>}
      </Section>
      <Section title="Machynex hardware" right={<span className="font-mono text-[10px] text-zinc-600">{kit === 'bench' ? 'bench kit' : P.scope === 'concept' ? 'industrial kit · concept' : 'industrial kit · preview'} · click to inspect</span>}>
        <HardwareList kit={kit} onInspect={onInspect} />
      </Section>
      <Section title="Rolling history" right={<span className="font-mono text-[10px] text-zinc-600">10 s · synthetic</span>}>
        <StripCharts sim={sim} />
      </Section>
      <Section title="Time to threshold" right={<span className="font-mono text-[10px] text-zinc-600">illustrative</span>}>
        <LeadTime snap={snap} crit={P.th.vibCrit} />
      </Section>
      <Section id="sec-terminal" title="Edge terminal" right={<span className="font-mono text-[10px] text-zinc-600">simulated node → dashboard</span>}>
        <EdgeTerminal logs={logs} sim={sim} />
      </Section>
      <About />
      <div className="font-mono pb-4 text-center text-[10px] text-zinc-600">Machynex concept simulation · synthetic data · no hardware connected</div>
    </div>
  );
}
