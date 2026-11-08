import { Play, RotateCcw, ScanEye, Square } from 'lucide-react';
import type { HealthState } from '../sim/engine';
import type { ShotName } from '../sim/shots';
import type { SensorKit } from '../sim/mounts';

export const NODE_ID = 'MNX-EDGE-01';

const DOT: Record<HealthState, string> = { NORMAL: 'bg-ok', EARLY: 'bg-warn', CRITICAL: 'bg-crit' };
const STATE_WORD: Record<HealthState, string> = { NORMAL: 'Normal', EARLY: 'Advisory', CRITICAL: 'Critical' };

/** hardware camera presets shown in the header; ids map to shots in src/sim/shots.ts */
export function cameraPresets(kit: SensorKit): { id: ShotName; label: string }[] {
  return [
    { id: 'rig', label: 'Full Rig' },
    { id: 'nodeMacro', label: 'Edge Node' },
    { id: 'puck', label: 'Vibration Pod' },
    // the bench kit has no clamp: the same shot frames the in-line Hall module
    { id: 'clamp', label: kit === 'industrial' ? 'Current Clamp' : 'Current Sensor' },
  ];
}

interface HeaderBarProps {
  state: HealthState;
  activeShot: ShotName | null;
  onFocus: (name: ShotName) => void;
  onReset: () => void;
  walkActive: boolean;
  onStartWalk: () => void;
  onStopWalk: () => void;
  kit: SensorKit;
  xray: boolean;
  onXray: () => void;
}

const ghost = 'flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100';

export function HeaderBar({ state, activeShot, onFocus, onReset, walkActive, onStartWalk, onStopWalk, kit, xray, onXray }: HeaderBarProps) {
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
        <span className="hidden font-mono text-[11px] text-zinc-500 2xl:inline">· {STATE_WORD[state]}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden h-7 items-stretch overflow-hidden rounded-md border border-line sm:flex" role="group" aria-label="Camera presets">
          {cameraPresets(kit).map((p, i) => (
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
        <button
          className={`${ghost} ${xray ? 'border-zinc-600 bg-zinc-800 text-zinc-100' : ''}`}
          onClick={onXray}
          aria-pressed={xray}
          title="X-ray / open enclosure: host machine at 25% wireframe, node lid slides open"
        >
          <ScanEye size={12} />X-Ray
        </button>

        {walkActive ? (
          <button className={ghost} onClick={onStopWalk} aria-label="Stop walkthrough"><Square size={12} />Stop<span className="hidden xl:inline"> walkthrough</span></button>
        ) : (
          <button className={ghost} onClick={onStartWalk} title="Evaluator walkthrough" aria-label="Evaluator walkthrough"><Play size={12} />Walkthrough</button>
        )}
        <button className={ghost} onClick={onReset} title="Restore the boot state: setpoints, interlock, logs and capture" aria-label="Reset Simulation">
          <RotateCcw size={12} />Reset<span className="hidden xl:inline"> Simulation</span>
        </button>
      </div>
    </header>
  );
}
