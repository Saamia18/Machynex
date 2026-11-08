import { Play, RotateCcw, Square } from 'lucide-react';
import type { HealthState } from '../sim/engine';
import type { ShotName } from '../sim/shots';

export const NODE_ID = 'MNX-EDGE-01';

const DOT: Record<HealthState, string> = { NORMAL: 'bg-ok', EARLY: 'bg-warn', CRITICAL: 'bg-crit' };
const STATE_WORD: Record<HealthState, string> = { NORMAL: 'Normal', EARLY: 'Advisory', CRITICAL: 'Critical' };

/** camera presets shown in the header; ids map to existing shots in src/sim/shots.ts */
export const CAMERA_PRESETS: { id: ShotName; label: string }[] = [
  { id: 'home', label: 'Default' },
  { id: 'bearing', label: 'Bearing' },
  { id: 'edge', label: 'Controls' },
];

interface HeaderBarProps {
  state: HealthState;
  activeShot: ShotName | null;
  onFocus: (name: ShotName) => void;
  onReset: () => void;
  walkActive: boolean;
  onStartWalk: () => void;
  onStopWalk: () => void;
}

const ghost = 'flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100';

export function HeaderBar({ state, activeShot, onFocus, onReset, walkActive, onStartWalk, onStopWalk }: HeaderBarProps) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-canvas px-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold tracking-tight text-zinc-100">Machynex</span>
        <span className="font-mono text-[11px] text-zinc-500">v1.0-sim</span>
      </div>

      <div
        className="flex h-7 items-center gap-2 rounded-md border border-line px-2.5"
        title="Simulated node. No hardware connected."
        role="status"
        aria-label={`Simulated node ${NODE_ID}: ${STATE_WORD[state]}`}
      >
        <span className={`h-2 w-2 rounded-full ${DOT[state]}`} />
        <span className="font-mono text-[11px] text-zinc-400">Node: {NODE_ID}</span>
        <span className="hidden font-mono text-[11px] text-zinc-500 md:inline">· {STATE_WORD[state]}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden h-7 items-stretch overflow-hidden rounded-md border border-line sm:flex" role="group" aria-label="Camera presets">
          {CAMERA_PRESETS.map((p, i) => (
            <button
              key={p.id}
              onClick={() => onFocus(p.id)}
              aria-pressed={activeShot === p.id}
              className={`px-2.5 text-xs transition-colors ${i > 0 ? 'border-l border-line' : ''} ${activeShot === p.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {walkActive ? (
          <button className={ghost} onClick={onStopWalk}><Square size={12} />Stop walkthrough</button>
        ) : (
          <button className={ghost} onClick={onStartWalk}><Play size={12} />Evaluator walkthrough</button>
        )}
        <button className={ghost} onClick={onReset} title="Restore the boot state: setpoints, interlock, logs and capture">
          <RotateCcw size={12} />Reset Simulation
        </button>
      </div>
    </header>
  );
}
