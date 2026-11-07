import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Activity, Gauge, Info, Power, RotateCcw, ShieldAlert, Terminal as TerminalIcon, Thermometer, TrendingUp, Waves, Zap } from 'lucide-react';
import type { LogLine, PresetName, SetpointKey, Simulator, Snapshot } from '../sim/engine';
import { CONFIG as C } from '../sim/config';
import { SpectrumChart, StripCharts } from './Charts';
import { VibrationGauge } from './Gauge';
import { buildCsv, buildJson, downloadText, stamp } from '../sim/exporter';

const STATE_STYLE = {
  NORMAL: { text: 'text-emerald-300', border: 'border-emerald-500/60', bg: 'bg-emerald-500/10', dot: 'bg-emerald-400', ring: 'rgba(16,185,129,.55)' },
  EARLY: { text: 'text-amber-300', border: 'border-amber-500/60', bg: 'bg-amber-500/10', dot: 'bg-amber-400', ring: 'rgba(245,158,11,.55)' },
  CRITICAL: { text: 'text-red-300', border: 'border-red-500/70', bg: 'bg-red-500/10', dot: 'bg-red-500', ring: 'rgba(239,68,68,.65)' },
} as const;

function Section({ icon, title, children, right, id }: { icon: ReactNode; title: string; children: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {icon}
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ health banner
export function HealthBanner({ snap }: { snap: Snapshot }) {
  const s = STATE_STYLE[snap.state];
  const ev = snap.evidence;
  const chip = (on: boolean, label: string) => (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${on ? 'bg-cyan-500/20 text-cyan-300' : 'bg-zinc-800 text-zinc-500'}`}>
      {label} {on ? '●' : '○'}
    </span>
  );
  return (
    <div className={`rounded-lg border ${s.border} ${s.bg} p-3`} role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className={`h-3.5 w-3.5 rounded-full ${s.dot} ${snap.state === 'CRITICAL' ? 'blink-crit' : 'pulse-ring'}`} style={{ '--ring': s.ring } as CSSProperties} />
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-zinc-400">Machine health state</div>
          <div className={`truncate text-base font-bold leading-tight ${s.text}`}>{snap.stateLabel}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[10px] uppercase tracking-widest text-zinc-400">Safety cut-off (concept)</div>
          <div className={`text-sm font-bold ${snap.relayClosed ? 'text-emerald-300' : 'text-red-300'}`}>{snap.relayClosed ? 'CLOSED · motor powered' : 'OPEN · motor stopped'}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
        <span>Evidence:</span>
        {chip(ev.vib, 'vibration')}
        {chip(ev.temp, 'temperature')}
        {chip(ev.cur, 'current')}
        <span className="ml-1">confidence <b className="text-zinc-200">{snap.confidence}</b></span>
        <span className="ml-auto text-zinc-500">persistence {C.persistS.vib.toFixed(1)} s · hysteresis {C.hysteresisS.toFixed(1)} s</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ metrics
function Metric({ icon, label, value, unit, tone, sub }: { icon: ReactNode; label: string; value: string; unit: string; tone?: 'ok' | 'warn' | 'crit'; sub?: ReactNode }) {
  const col = tone === 'crit' ? 'text-red-300' : tone === 'warn' ? 'text-amber-300' : 'text-cyan-300';
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">{icon}{label}</div>
      <div className={`mono mt-1 text-xl font-semibold leading-none ${col}`}>
        {value}<span className="ml-1 text-xs font-normal text-zinc-500">{unit}</span>
      </div>
      {sub && <div className="mt-1 text-[10px] text-zinc-500">{sub}</div>}
    </div>
  );
}

export function MetricsGrid({ snap }: { snap: Snapshot }) {
  const tTone = snap.temp >= C.temp.crit ? 'crit' : snap.temp >= C.temp.warn ? 'warn' : 'ok';
  const cTone = snap.current >= C.current.crit ? 'crit' : 'ok';
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <div className="col-span-2 sm:col-span-3">
        <VibrationGauge snap={snap} />
      </div>
      <Metric icon={<Gauge size={12} />} label="Motor speed" value={Math.round(snap.rpm).toString()} unit="rpm" sub={`1X = ${(snap.rpm / 60).toFixed(2)} Hz`} />
      <Metric icon={<Activity size={12} />} label="Imbalance mass" value={snap.massG.toFixed(2)} unit="g" sub={<>{snap.vibAccG.toFixed(3)} g accel · eccentric set-screw</>} />
      <Metric icon={<Power size={12} />} label="Data source" value="synthetic" unit="" sub="no hardware connected" />
      <Metric icon={<Zap size={12} />} label="Current" value={snap.current.toFixed(2)} unit="A" tone={cTone} sub="optional channel" />
      <Metric icon={<Thermometer size={12} />} label="Stator temp" value={snap.temp.toFixed(1)} unit="°C" tone={tTone} sub="time-compressed thermal lag" />
      <Metric icon={<Waves size={12} />} label="Severity band" value={snap.vibZone} unit={snap.vibBand.toLowerCase()} sub="illustrative zone limits" />
    </div>
  );
}

// ------------------------------------------------------------------ controls
function Slider({ label, unit, k, min, max, step, value, onChange, decimals = 2, hint }: { label: string; unit: string; k: SetpointKey; min: number; max: number; step: number; value: number; onChange: (k: SetpointKey, v: number) => void; decimals?: number; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-zinc-300">{label}</span>
        <span className="mono text-cyan-300">{value.toFixed(decimals)} <span className="text-zinc-500">{unit}</span></span>
      </div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(k, Number(e.target.value))} aria-label={label} />
      {hint && <div className="mt-0.5 text-[10px] text-zinc-600">{hint}</div>}
    </label>
  );
}

export function Controls({ sim, snap, onUserGesture }: { sim: Simulator; snap: Snapshot; onUserGesture: () => void }) {
  const [resetMsg, setResetMsg] = useState<string>('');
  const set = (k: SetpointKey, v: number) => sim.setTarget(k, v);
  const preset = (p: PresetName) => { onUserGesture(); sim.preset(p); setResetMsg(''); };
  const reset = () => {
    onUserGesture();
    const r = sim.resetRelay();
    setResetMsg(r.ok ? '' : r.reason ?? '');
  };
  const btn = 'rounded-md border px-2.5 py-2 text-xs font-semibold transition-colors';
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Slider label="Eccentric mass (imbalance)" unit="g" k="massG" min={C.massMin} max={C.massMax} step={0.01} value={snap.sp.massG} onChange={set} hint="0.05 g → 0.5 mm/s, 1.5 g → 8.0 mm/s at nominal speed" />
        <Slider label="Motor speed setpoint" unit="rpm" k="rpm" min={C.rpmMin} max={C.rpmMax} step={10} value={snap.sp.rpm} onChange={set} decimals={0} hint="Vibration scales ~ rpm² (simple model)" />
        <Slider label="Motor current" unit="A" k="currentA" min={C.currentMin} max={C.currentMax} step={0.05} value={snap.sp.currentA} onChange={set} hint={`nominal ${C.currentNominal} A · cut-off above ${C.current.crit} A`} />
        <Slider label="Stator temperature" unit="°C" k="tempC" min={C.tempMin} max={C.tempMax} step={0.5} value={snap.sp.tempC} onChange={set} decimals={1} hint={`nominal ${C.tempNominal} °C · advisory ${C.temp.warn}–${C.temp.crit} °C · cut-off above ${C.temp.crit} °C`} />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
        <input type="checkbox" checked={snap.sp.coupling} onChange={(e) => sim.setCoupling(e.target.checked)} />
        Physical coupling (illustrative): imbalance slightly raises current and temperature
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button className={`${btn} border-emerald-600/60 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20`} onClick={() => preset('baseline')}>1 · Normal Baseline</button>
        <button className={`${btn} border-amber-600/60 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20`} onClick={() => preset('progressive')}>2 · Progressive Unbalance</button>
        <button className={`${btn} border-cyan-600/60 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20`} onClick={() => preset('shock')}>3 · Transient Floor Shock</button>
        <button className={`${btn} border-red-600/60 bg-red-500/10 text-red-300 hover:bg-red-500/20`} onClick={() => preset('critical')}>4 · Critical Trip Event</button>
        <button className={`${btn} col-span-1 flex items-center justify-center gap-1.5 border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 sm:col-span-2`} onClick={reset}>
          <RotateCcw size={13} />5 · Reset Relay
        </button>
      </div>
      {!snap.relayClosed && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-200">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            Cut-off latched open. {snap.faultPresent ? 'The fault is still present: press “Normal Baseline” first, then “Reset Relay”.' : 'Fault cleared: press “Reset Relay” to re-engage.'}
            {resetMsg && <b className="ml-1">Last attempt: {resetMsg}.</b>}
          </span>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ lead time
export function LeadTime({ snap }: { snap: Snapshot }) {
  const v = snap.leadTimeS;
  return (
    <div className="flex items-center gap-3">
      <div className="mono text-2xl font-semibold text-cyan-300">{v === null ? '—' : v < 1 ? '< 1 s' : `~${Math.round(v)} s`}</div>
      <div className="text-[11px] leading-snug text-zinc-400">
        <div className="font-semibold text-amber-300">ILLUSTRATIVE TREND ESTIMATE — SYNTHETIC DATA</div>
        <div>Linear extrapolation of the recent vibration slope to the {C.vib.crit} mm/s limit. It describes a staged ramp in this simulation. It is not remaining useful life and not a prediction of failure.</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ terminal
const KIND_STYLE: Record<string, string> = {
  STATE: 'text-amber-300', FILTER: 'text-cyan-300', TRIP: 'text-red-400', RESET: 'text-emerald-300', INFO: 'text-zinc-400', PACKET: 'text-zinc-500',
};

export function EdgeTerminal({ logs, sim }: { logs: LogLine[]; sim: Simulator }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [hidePackets, setHidePackets] = useState(false);
  const shown = (hidePackets ? logs.filter((l) => l.kind !== 'PACKET') : logs).slice(-120);
  useEffect(() => {
    if (follow && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [shown.length, follow]);
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-end gap-3 text-[11px] text-zinc-400">
        <span className="mr-auto flex items-center gap-1.5">
          Export capture:
          <button className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-semibold text-cyan-300 hover:bg-zinc-800" onClick={() => downloadText(`machynex-synthetic-telemetry-${stamp()}.json`, buildJson(sim.getCapture()), 'application/json')}>JSON</button>
          <button className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-semibold text-cyan-300 hover:bg-zinc-800" onClick={() => downloadText(`machynex-synthetic-telemetry-${stamp()}.csv`, buildCsv(sim.getCapture()), 'text/csv')}>CSV</button>
        </span>
        <label className="flex cursor-pointer items-center gap-1"><input type="checkbox" checked={hidePackets} onChange={(e) => setHidePackets(e.target.checked)} />events only</label>
        <label className="flex cursor-pointer items-center gap-1"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />auto-scroll</label>
      </div>
      <div ref={boxRef} className="scroll-thin mono h-56 overflow-y-auto rounded-md border border-zinc-800 bg-black p-2 text-[11px] leading-relaxed">
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
    <Section icon={<Info size={13} />} title="What this is, and what it is not" right={<button className="text-[11px] text-cyan-300 hover:underline" onClick={() => setOpen(!open)}>{open ? 'hide' : 'show'}</button>}>
      <p className="text-xs text-zinc-400">A concept visualisation for the Machynex proposal. Every value is synthetic and no hardware is connected.</p>
      {open && (
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[11px] leading-snug text-zinc-400">
          <li>Rig shown matches the proposal: 12 V DC motor (775-class), MPU6050 accelerometer, DS18B20 temperature probe, optional ACS712-type current module, ESP32 acquisition node. The safety cut-off and indicator LEDs are a concept add-on and are not in the current bill of materials.</li>
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

export function DashboardPane({ sim, snap, logs, onUserGesture }: { sim: Simulator; snap: Snapshot; logs: LogLine[]; onUserGesture: () => void }) {
  return (
    <div className="space-y-3 p-3">
      <div id="sec-health" className="space-y-3">
        <HealthBanner snap={snap} />
        <MetricsGrid snap={snap} />
      </div>
      <Section icon={<Activity size={13} />} title="Fault injection and presets">
        <Controls sim={sim} snap={snap} onUserGesture={onUserGesture} />
      </Section>
      <Section id="sec-spectrum" icon={<Waves size={13} />} title="Vibration spectrum waterfall · 0–200 Hz (synthetic)">
        <SpectrumChart sim={sim} />
      </Section>
      <Section icon={<Activity size={13} />} title="Rolling 10 s history (synthetic)">
        <StripCharts sim={sim} />
      </Section>
      <Section icon={<TrendingUp size={13} />} title="Time to threshold (illustrative)">
        <LeadTime snap={snap} />
      </Section>
      <Section id="sec-terminal" icon={<TerminalIcon size={13} />} title="Edge terminal · simulated ESP32 → laptop stream">
        <EdgeTerminal logs={logs} sim={sim} />
      </Section>
      <About />
      <div className="pb-6 text-center text-[10px] text-zinc-600">Machynex concept simulation · synthetic data · no hardware connected</div>
    </div>
  );
}
