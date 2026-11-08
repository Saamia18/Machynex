import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Info, RotateCcw } from 'lucide-react';
import type { HealthState, LogLine, PresetName, SetpointKey, Simulator, Snapshot } from '../sim/engine';
import { CONFIG as C } from '../sim/config';
import { SpectrumChart, StripCharts } from './Charts';
import { buildCsv, buildJson, downloadText, stamp } from '../sim/exporter';

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
  const reset = () => {
    onUserGesture();
    const r = sim.resetRelay();
    setResetMsg(r.ok ? '' : r.reason ?? '');
  };
  return (
    <div className="rounded-md border border-line bg-panel">
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
          <div className="mt-1 text-[10px] text-zinc-600">DC-rated solid-state switch · not in the proposed bill of materials</div>
        </div>
        <button
          onClick={reset}
          disabled={energized}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw size={12} />Reset Interlock
        </button>
      </div>
      {!energized && (
        <div className="border-t border-line px-3 py-2 text-[11px] leading-snug text-zinc-400">
          {snap.faultPresent ? 'The fault is still present: press “Nominal” first, then “Reset Interlock”.' : 'Fault cleared: press “Reset Interlock” to re-energize.'}
          {resetMsg && <span className="ml-1 text-crit">Last attempt refused: {resetMsg}.</span>}
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

export function MetricsGrid({ snap }: { snap: Snapshot }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line">
      <Metric label="Vibration RMS" value={snap.vib.toFixed(2)} unit="mm/s" tone={level(snap.vib, C.vib.warn, C.vib.crit)} sub={`mass ${snap.massG.toFixed(2)} g · zone ${snap.vibZone}`} />
      <Metric label="Motor current" value={snap.current.toFixed(2)} unit="A" tone={level(snap.current, null, C.current.crit)} sub="optional · ACS712-type" />
      <Metric label="Stator temp" value={snap.temp.toFixed(1)} unit="°C" tone={level(snap.temp, C.temp.warn, C.temp.crit)} sub="DS18B20 · time-compressed" />
      <Metric label="Rotational speed" value={Math.round(snap.rpm).toString()} unit="rpm" sub={`1X ${(snap.rpm / 60).toFixed(2)} Hz`} />
    </div>
  );
}

// ------------------------------------------------------------------ controls
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

export const PRESET_BUTTONS: { id: PresetName; label: string; title: string }[] = [
  { id: 'baseline', label: 'Nominal', title: 'Return setpoints to the healthy baseline (0.15 g, 1.2 A, 38 °C, 1450 rpm)' },
  { id: 'progressive', label: 'Imbalance', title: 'Progressive unbalance: 0.15 g to 0.65 g over 8 s' },
  { id: 'shock', label: 'Transient Knock', title: '300 ms floor knock: rejected by the persistence filter' },
  { id: 'critical', label: 'Critical Fault', title: 'Vibration, current and temperature spike: trips the interlock after persistence' },
];

export function Controls({ sim, snap, onUserGesture }: { sim: Simulator; snap: Snapshot; onUserGesture: () => void }) {
  const set = (k: SetpointKey, v: number) => sim.setTarget(k, v);
  const preset = (p: PresetName) => { onUserGesture(); sim.preset(p); };
  return (
    <div className="space-y-4">
      <div>
        <Label className="mb-1.5">Diagnostic presets</Label>
        <div className="grid grid-cols-2 overflow-hidden rounded-md border border-line sm:grid-cols-4" role="group" aria-label="Diagnostic presets">
          {PRESET_BUTTONS.map((p, i) => (
            <button
              key={p.id}
              title={p.title}
              onClick={() => preset(p.id)}
              className={`h-8 px-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100 ${i > 0 ? 'border-l border-line' : ''} ${i === 2 ? 'max-sm:border-l-0 max-sm:border-t' : ''} ${i === 3 ? 'max-sm:border-t' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
        <Slider label="Eccentric mass" unit="g" k="massG" min={C.massMin} max={C.massMax} step={0.01} value={snap.sp.massG} onChange={set} hint="0.05 g → 0.5 · 1.5 g → 8.0 mm/s" />
        <Slider label="Speed setpoint" unit="rpm" k="rpm" min={C.rpmMin} max={C.rpmMax} step={10} value={snap.sp.rpm} onChange={set} decimals={0} hint="vibration ∝ rpm² (simple model)" />
        <Slider label="Motor current" unit="A" k="currentA" min={C.currentMin} max={C.currentMax} step={0.05} value={snap.sp.currentA} onChange={set} hint={`nominal ${C.currentNominal} A · trip > ${C.current.crit} A`} />
        <Slider label="Stator temperature" unit="°C" k="tempC" min={C.tempMin} max={C.tempMax} step={0.5} value={snap.sp.tempC} onChange={set} decimals={1} hint={`advisory ${C.temp.warn}–${C.temp.crit} · trip > ${C.temp.crit} °C`} />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
        <input type="checkbox" checked={snap.sp.coupling} onChange={(e) => sim.setCoupling(e.target.checked)} />
        Physical coupling (illustrative): imbalance slightly raises current and temperature
      </label>
    </div>
  );
}

// ------------------------------------------------------------------ simulation settings
export function SimulationSettings({ slowMo, onSlowMo }: { slowMo: number; onSlowMo: (v: number) => void }) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between text-xs">
        <span className="text-zinc-400">Visual slow-motion</span>
        <span className="font-mono text-zinc-100">{slowMo.toFixed(2)}×</span>
      </div>
      <input type="range" className="w-full" min={0.01} max={1} step={0.01} value={slowMo} onChange={(e) => onSlowMo(Number(e.target.value))} aria-label="Visual slow-motion" />
      <div className="mt-1.5 text-[10px] text-zinc-600">Slows only how rotation is drawn (real-time speed strobes on a 60 Hz screen). Physics and readouts run in real time.</div>
    </label>
  );
}

// ------------------------------------------------------------------ lead time
export function LeadTime({ snap }: { snap: Snapshot }) {
  const v = snap.leadTimeS;
  return (
    <div className="flex items-start gap-4">
      <div className="font-mono w-20 shrink-0 text-2xl leading-none text-zinc-100">{v === null ? '—' : v < 1 ? '< 1 s' : `~${Math.round(v)} s`}</div>
      <div className="text-[11px] leading-snug text-zinc-500">
        <div className="font-mono text-warn">ILLUSTRATIVE TREND ESTIMATE — SYNTHETIC DATA</div>
        <div className="mt-0.5">Linear extrapolation of the recent vibration slope to the {C.vib.crit} mm/s limit. It describes a staged ramp in this simulation. It is not remaining useful life and not a prediction of failure.</div>
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
          <button className={btn} onClick={() => downloadText(`machynex-synthetic-telemetry-${stamp()}.csv`, buildCsv(sim.getCapture()), 'text/csv')}>CSV</button>
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

// ------------------------------------------------------------------ about
export function About() {
  const [open, setOpen] = useState(false);
  return (
    <Section title="What this is, and what it is not" right={<button className="text-[11px] text-zinc-400 hover:text-zinc-100" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>}>
      <p className="text-xs text-zinc-400">A concept visualisation for the Machynex proposal. Every value is synthetic and no hardware is connected.</p>
      {open && (
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[11px] leading-snug text-zinc-400">
          <li>Rig shown matches the proposal: 12 V DC motor (775-class), MPU6050 accelerometer, DS18B20 temperature probe, optional ACS712-type current module, ESP32 acquisition node. The safety cut-off (shown as a DC-rated solid-state switch) and indicator LEDs are a concept add-on and are not in the current bill of materials.</li>
          <li>All thresholds ({C.vib.warn} / {C.vib.crit} mm/s, {C.temp.warn} / {C.temp.crit} °C, {C.current.crit} A) are illustrative placeholders. Real limits would be set from baseline runs on the real rig. ISO 20816 vibration zones apply to larger machines (the 20816-3 part covers machines above 15 kW), so no ISO zone is claimed here.</li>
          <li>Detection logic mirrors the proposal: persistence ({C.persistS.vib.toFixed(1)} s), hysteresis ({C.hysteresisS.toFixed(1)} s), sensor agreement shown as confidence, and a hard vibration limit that corroboration never suppresses. The 300 ms “knock” is rejected because it is shorter than the persistence window and has no thermal/current support.</li>
          <li>Vibration model: linear in imbalance mass, scaling with speed squared. The spectrum is generated analytically with a 1X peak at rpm/60, a small 2X, 3X and a rig-body resonance bump. Thermal response is time-compressed so it is visible in a demo.</li>
          <li>Slow-motion in the 3D view slows only the drawing of rotation so it can be seen; displayed rpm and frequencies are the simulated values.</li>
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
}

export function DashboardPane({ sim, snap, logs, onUserGesture, slowMo, onSlowMo }: PaneProps) {
  return (
    <div className="space-y-3 p-3">
      <div id="sec-health" className="scroll-mt-3 space-y-3">
        <HealthBanner snap={snap} />
        <InterlockCard sim={sim} snap={snap} onUserGesture={onUserGesture} />
        <MetricsGrid snap={snap} />
      </div>
      <Section title="Fault injection">
        <Controls sim={sim} snap={snap} onUserGesture={onUserGesture} />
      </Section>
      <Section id="sec-spectrum" title="Vibration spectrum" right={<span className="font-mono text-[10px] text-zinc-600">0–200 Hz · synthetic</span>}>
        <SpectrumChart sim={sim} />
      </Section>
      <Section title="Rolling history" right={<span className="font-mono text-[10px] text-zinc-600">10 s · synthetic</span>}>
        <StripCharts sim={sim} />
      </Section>
      <Section title="Time to threshold" right={<span className="font-mono text-[10px] text-zinc-600">illustrative</span>}>
        <LeadTime snap={snap} />
      </Section>
      <Section id="sec-terminal" title="Edge terminal" right={<span className="font-mono text-[10px] text-zinc-600">simulated ESP32 → laptop</span>}>
        <EdgeTerminal logs={logs} sim={sim} />
      </Section>
      <Section title="Simulation">
        <SimulationSettings slowMo={slowMo} onSlowMo={onSlowMo} />
      </Section>
      <About />
      <div className="font-mono pb-4 text-center text-[10px] text-zinc-600">Machynex concept simulation · synthetic data · no hardware connected</div>
    </div>
  );
}
