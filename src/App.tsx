import { useCallback, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { useSimulator } from './sim/useSimulator';
import { useWalkthrough } from './sim/walkthrough';
import { makeShot } from './sim/shots';
import type { CameraShot, ShotName } from './sim/shots';
import { Viewport } from './components/Scene';
import { DashboardPane } from './components/Dashboard';

export default function App() {
  const { sim, snap, logs, paused, setPaused, muted, setMuted, alarms, setAlarms, unlock } = useSimulator();
  const [shot, setShot] = useState<CameraShot | null>(null);
  const focus = useCallback((name: ShotName) => setShot(makeShot(name)), []);
  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const { walk, startWalkthrough, stopWalkthrough } = useWalkthrough(sim, focus, scrollTo, unlock);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-zinc-950">
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900/70 px-3 py-1.5">
        <span className="mono flex-1 text-center text-[10px] font-semibold tracking-[0.18em] text-amber-300/90 sm:text-[11px]">
          DIGITAL TWIN SIMULATION | SYNTHETIC DATA | NO HARDWARE CONNECTED
        </span>
        {walk.active ? (
          <button className="flex shrink-0 items-center gap-1.5 rounded-md border border-red-500/60 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/20" onClick={stopWalkthrough}>
            <Square size={12} />Stop walkthrough
          </button>
        ) : (
          <button className="flex shrink-0 items-center gap-1.5 rounded-md border border-cyan-500/60 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20" onClick={startWalkthrough}>
            <Play size={12} />Evaluator walkthrough
          </button>
        )}
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[55%_45%] lg:grid-cols-[60%_40%] lg:grid-rows-1">
        <div className="relative min-h-0 border-b border-zinc-800 lg:border-b-0 lg:border-r">
          <Viewport
            sim={sim}
            snap={snap}
            paused={paused}
            onTogglePause={() => setPaused(!paused)}
            muted={muted}
            onToggleMute={() => setMuted(!muted)}
            alarms={alarms}
            onToggleAlarms={() => setAlarms(!alarms)}
            onUserGesture={unlock}
            shot={shot}
            onFocus={focus}
            walk={walk}
            onStopWalk={stopWalkthrough}
          />
        </div>
        <div className="scroll-thin min-h-0 overflow-y-auto bg-zinc-950">
          <DashboardPane sim={sim} snap={snap} logs={logs} onUserGesture={unlock} />
        </div>
      </main>
    </div>
  );
}
