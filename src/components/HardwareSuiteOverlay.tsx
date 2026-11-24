import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, FileText, X } from 'lucide-react';
import type { HardwareId } from '../sim/hardwareSpecs';
import type { SensorKit } from '../sim/mounts';
import { SUITE_CODE, SUITE_ORDER, liveReading, stepSuite, suiteCard, suiteName } from '../sim/inspection';
import type { LiveInputs } from '../sim/inspection';
import { CONCEPT_TAG } from './InspectorDrawer';

// Left-docked hardware list on the 3D canvas and, while a part is inspected, a flat presentation card below it.
// Flat panel surface, 1px hairline border, radius <= 6px, no glow. Esc re-assembles and exits (unless the spec sheet
// drawer is open: its own Esc closes first).

interface Props {
  kit: SensorKit;
  /** host machine runs on AC (false on the 12 V DC bench rig) */
  acMachine: boolean;
  selected: HardwareId | null;
  onSelect: (id: HardwareId) => void;
  onExit: () => void;
  onOpenSheet: () => void;
  /** the right-pane spec sheet is open: leave Esc to it */
  sheetOpen: boolean;
  live: LiveInputs;
}

const focusRing = 'outline-none focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-zinc-400';
const label = 'text-[11px] font-medium uppercase tracking-wider text-zinc-500';

function Row({ k, v, unverified }: { k: string; v: string; unverified?: boolean }) {
  return (
    <div className="grid grid-cols-[4.75rem_1fr] gap-2 py-1 text-[11px] leading-snug">
      <span className="text-zinc-500">{k}</span>
      <span className="text-zinc-200">
        {v}
        {unverified && <span className="font-mono ml-1.5 rounded-sm border border-amber-500/40 px-1 text-[10px] text-warn">unverified</span>}
      </span>
    </div>
  );
}

export function HardwareSuiteOverlay({ kit, acMachine, selected, onSelect, onExit, onOpenSheet, sheetOpen, live }: Props) {
  useEffect(() => {
    if (!selected || sheetOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onExit(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, sheetOpen, onExit]);

  const card = selected ? suiteCard(selected, kit, acMachine) : null;
  const reading = selected ? liveReading(selected, live) : null;
  const idx = selected ? SUITE_ORDER.indexOf(selected) + 1 : 0;

  return (
    <div className="pointer-events-none flex max-h-full w-[min(18rem,calc(100vw-1.5rem))] flex-col gap-2">
      <nav className="pointer-events-auto rounded-md border border-line bg-panel" aria-label="Hardware suite">
        <div className="flex h-7 items-center justify-between border-b border-line px-2.5">
          <span className={label}>Hardware suite</span>
          {selected && <span className="font-mono text-[10px] text-zinc-500">Esc to re-assemble</span>}
        </div>
        <ul className="py-0.5">
          {SUITE_ORDER.map((id) => {
            const on = id === selected;
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => (on ? onExit() : onSelect(id))}
                  className={`flex h-7 w-full items-center gap-2.5 px-2.5 text-left text-xs transition-colors ${focusRing} ${on ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'}`}
                >
                  <span className="font-mono w-14 shrink-0 text-[11px] text-zinc-500">{SUITE_CODE[id]}</span>
                  <span className="truncate">{suiteName(id, kit)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {card && reading && selected && (
        <section className="scroll-thin pointer-events-auto min-h-0 overflow-y-auto rounded-md border border-line bg-panel" aria-label="Component inspection">
          <div className="flex items-start gap-2 border-b border-line px-3 py-2">
            <div className="min-w-0 flex-1" aria-live="polite">
              <div className="font-mono text-[11px] text-zinc-500">{card.code} · {idx} / {SUITE_ORDER.length}</div>
              <h3 className="text-sm font-semibold text-zinc-100">{card.name}</h3>
              {card.concept && <div className="font-mono mt-0.5 text-[10px] text-warn">{CONCEPT_TAG}</div>}
            </div>
            <button type="button" onClick={onExit} aria-label="Exit inspection (Esc)" title="Re-assemble and exit (Esc)" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 ${focusRing}`}>
              <X size={13} />
            </button>
          </div>

          <div className="border-b border-line px-3 py-2">
            <div className="flex items-baseline justify-between">
              <span className={label}>{reading.label}</span>
              <span className="font-mono text-[10px] text-warn">SIMULATED</span>
            </div>
            <div className="font-mono mt-0.5 text-lg tabular-nums text-zinc-100">
              {reading.value}{reading.unit && <span className="ml-1.5 text-xs text-zinc-500">{reading.unit}</span>}
            </div>
          </div>

          <div className="px-3 py-1.5">
            <div className={`${label} mt-1`}>Measures</div>
            <Row k="Quantity" v={card.measures} />
            <Row k="Bandwidth" v={card.bandwidth} unverified={card.unverified.includes('Bandwidth')} />
            <div className={`${label} mt-2`}>Physical build &amp; bus</div>
            <Row k="Enclosure" v={card.enclosure} unverified={card.unverified.includes('Rating')} />
            <Row k="IC / part" v={card.ic} />
            <Row k="Bus" v={card.bus} />
            <div className={`${label} mt-2`}>Diagnostic role</div>
            <p className="py-1 text-[11px] leading-snug text-zinc-300">{card.role}</p>
            {card.note && <p className="mt-0.5 border-t border-line pt-1.5 text-[10px] leading-snug text-zinc-500">{card.note}</p>}
          </div>

          <div className="sticky bottom-0 flex items-center gap-1.5 border-t border-line bg-panel px-3 py-2">
            <button type="button" onClick={() => onSelect(stepSuite(selected, -1))} aria-label="Previous component" className={`flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-line px-2 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 ${focusRing}`}>
              <ChevronLeft size={12} />Prev
            </button>
            <button type="button" onClick={() => onSelect(stepSuite(selected, 1))} aria-label="Next component" className={`flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-line px-2 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 ${focusRing}`}>
              Next<ChevronRight size={12} />
            </button>
            <button type="button" onClick={onOpenSheet} title="Open the full spec sheet with raw register values" className={`ml-auto flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-line px-2 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 ${focusRing}`}>
              <FileText size={12} />Spec sheet
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
