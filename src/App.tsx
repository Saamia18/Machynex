import { useCallback, useState } from 'react';
import { useSimulator } from './sim/useSimulator';
import { useWalkthrough } from './sim/walkthrough';
import { makeShot } from './sim/shots';
import type { CameraShot, ShotName } from './sim/shots';
import { Viewport } from './components/Scene';
import { DashboardPane } from './components/Dashboard';
import { HeaderBar } from './components/HeaderBar';
import { InspectorDrawer } from './components/InspectorDrawer';
import { CONFIG } from './sim/config';
import type { SensorKit } from './sim/mounts';
import type { HardwareId } from './sim/hardwareSpecs';

/** Honesty banner (CLAUDE.md §3.1). Always visible; tests/design-rules.test.ts asserts it is present. */
export const BANNER_TEXT = 'PROPOSED CONCEPT · SYNTHETIC TELEMETRY · PROOF-OF-CONCEPT RIG · NO HARDWARE CONNECTED';

export default function App() {
  const { sim, snap, logs, paused, setPaused, muted, setMuted, alarms, setAlarms, unlock, resetSimulation } = useSimulator();
  const [shot, setShot] = useState<CameraShot | null>(null);
  const [slowMo, setSlowMo] = useState(0.08);
  const [kit, setKit] = useState<SensorKit>(CONFIG.sensorKitDefault);
  const [xray, setXray] = useState(false);
  const [inspect, setInspect] = useState<HardwareId | null>(null);
  const closeInspector = useCallback(() => setInspect(null), []);
  const focus = useCallback((name: ShotName) => setShot(makeShot(name)), []);
  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const { walk, startWalkthrough, stopWalkthrough } = useWalkthrough(sim, focus, scrollTo, unlock);

  const resetAll = useCallback(() => {
    if (walk.active) stopWalkthrough();
    resetSimulation();
    focus('home');
  }, [walk.active, stopWalkthrough, resetSimulation, focus]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-canvas">
      <div className="flex h-[22px] shrink-0 items-center justify-center border-b border-line bg-canvas px-3" role="note">
        <span className="font-mono truncate text-[10px] tracking-[0.14em] text-amber-500/80">
          {BANNER_TEXT}
        </span>
      </div>
      <HeaderBar
        state={snap.state}
        activeShot={shot?.name ?? null}
        onFocus={focus}
        onReset={resetAll}
        walkActive={walk.active}
        onStartWalk={startWalkthrough}
        onStopWalk={stopWalkthrough}
        kit={kit}
        xray={xray}
        onXray={() => setXray((v) => !v)}
      />
      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[55%_45%] lg:h-[calc(100dvh-66px)] lg:grid-cols-[60%_40%] lg:grid-rows-1">
        <div className="relative min-h-0 border-b border-line lg:border-b-0 lg:border-r">
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
            slowMo={slowMo}
            kit={kit}
            xray={xray}
            selected={inspect}
            onSelect={setInspect}
          />
        </div>
        <div className="relative min-h-0">
          <div className="scroll-thin h-full overflow-y-auto bg-canvas">
            <DashboardPane sim={sim} snap={snap} logs={logs} onUserGesture={unlock} slowMo={slowMo} onSlowMo={setSlowMo} kit={kit} onInspect={setInspect} />
          </div>
          <InspectorDrawer id={inspect} kit={kit} onKit={setKit} snap={snap} onClose={closeInspector} />
        </div>
      </main>
    </div>
  );
}
