import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Snapshot } from '../sim/engine';
import type { SensorKit } from '../sim/mounts';
import { inspectorEntry } from '../sim/hardwareSpecs';
import type { HardwareId, PhysicalInputs } from '../sim/hardwareSpecs';

export const CONCEPT_TAG = 'CONCEPT · not in the proposed bill of materials';

export function physicalInputs(snap: Snapshot): PhysicalInputs {
  return { t: snap.t, rpm: snap.rpm, vibAccG: snap.vibAccG, current: snap.current, temp: snap.temp, state: snap.stateLabel, relayClosed: snap.relayClosed };
}

function KV({ k, v, unverified }: { k: string; v: string; unverified?: boolean }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 border-b border-line py-1.5 text-[11px] last:border-b-0">
      <span className="text-zinc-500">{k}</span>
      <span className="text-zinc-200">
        {v}
        {unverified && <span className="font-mono ml-1.5 rounded-sm border border-amber-500/40 px-1 text-[10px] text-warn">unverified</span>}
      </span>
    </div>
  );
}

interface Props {
  id: HardwareId | null;
  kit: SensorKit;
  onKit: (k: SensorKit) => void;
  snap: Snapshot;
  onClose: () => void;
}

/** Slide-over spec sheet docked over the left edge of the right pane. Esc / Close dismiss it; Tab is trapped inside. */
export function InspectorDrawer({ id, kit, onKit, snap, onClose }: Props) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!id) return;
    if (!returnTo.current) returnTo.current = document.activeElement;
    closeRef.current?.focus();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const f = Array.from(ref.current.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute('disabled'));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (!ref.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, onClose]);

  useEffect(() => {
    if (id) return;
    const el = returnTo.current as HTMLElement | null;
    returnTo.current = null;
    if (el && typeof el.focus === 'function' && document.body.contains(el)) el.focus();
  }, [id]);

  if (!id) return null;
  const e = inspectorEntry(id, kit);
  const rows = e.raw(physicalInputs(snap));

  return (
    <aside
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="inspector-title"
      className="scroll-thin absolute inset-y-0 left-0 z-20 w-[min(380px,100%)] overflow-y-auto border-r border-line bg-panel"
    >
      <div className="sticky top-0 z-10 flex items-start gap-2 border-b border-line bg-panel px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Hardware inspector</div>
          <h2 id="inspector-title" className="mt-0.5 text-sm font-semibold text-zinc-100">{e.name}</h2>
          <div className="mt-0.5 text-xs text-zinc-400">{e.part}</div>
          {e.concept && <div className="font-mono mt-1.5 text-[10px] text-warn">{CONCEPT_TAG}</div>}
        </div>
        <button ref={closeRef} onClick={onClose} className="flex h-7 items-center gap-1 rounded-md border border-line px-2 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100" aria-label="Close inspector (Esc)">
          <X size={12} />Close
        </button>
      </div>

      <div className="space-y-4 px-4 py-3">
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Sensor kit</div>
          <div className="grid grid-cols-2 overflow-hidden rounded-md border border-line" role="group" aria-label="Sensor kit">
            {(['bench', 'industrial'] as SensorKit[]).map((k, i) => (
              <button
                key={k}
                onClick={() => onKit(k)}
                aria-pressed={kit === k}
                className={`h-7 text-xs transition-colors ${i ? 'border-l border-line' : ''} ${kit === k ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900'}`}
              >
                {k === 'bench' ? 'Bench (proposal)' : 'Industrial (preview)'}
              </button>
            ))}
          </div>
          {kit === 'industrial' && <p className="mt-1.5 text-[10px] leading-snug text-zinc-500">Preview of a future retrofit kit on the DC bench rig. Not part of the proposal; values marked unverified were not checked against a datasheet.</p>}
        </div>

        <section>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Interface</div>
          <KV k="Protocol" v={e.protocol} />
          <KV k="Sampling" v={e.samplingRate} />
          <KV k="Supply" v={e.supply} />
          <KV k="Role" v={e.role} />
          <KV k="Conversion" v={e.conversion} />
          {e.specs.map((s) => <KV key={s.label} k={s.label} v={s.value} unverified={s.unverified} />)}
        </section>

        <section>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Raw readings</span>
            <span className="font-mono text-[10px] text-warn">SIMULATED VALUES</span>
          </div>
          <div className="rounded-sm border border-line bg-canvas">
            {rows.map((r) => (
              <div key={r.label} className="font-mono grid grid-cols-[1fr_auto_auto] items-baseline gap-3 border-b border-line px-2 py-1.5 text-[11px] last:border-b-0">
                <span className="truncate font-sans text-zinc-500">{r.label}</span>
                <span className="text-zinc-500">{r.hex ?? ''}</span>
                <span className="min-w-[5.5rem] text-right text-zinc-100">{r.dec}{r.unit ? <span className="ml-1 text-zinc-500">{r.unit}</span> : null}</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-zinc-600">Computed from the synthetic plant at 10 Hz with the datasheet conversion above. No hardware is connected.</p>
        </section>

        <section>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Source</div>
          <p className="text-[11px] leading-snug text-zinc-400">{e.source}</p>
        </section>
      </div>
    </aside>
  );
}
