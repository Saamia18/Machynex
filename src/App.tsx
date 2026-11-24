import { useCallback, useEffect, useRef, useState } from 'react';
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
import { ASSETS } from './sim/assets';
import type { AssetId } from './sim/assets';
import { useAnomaly } from './sim/useAnomaly';
import { inspectShot } from './sim/inspection';

/** Honesty banner (CLAUDE.md §3.1). Always visible; tests/design-rules.test.ts asserts it is present. */
export const BANNER_TEXT = 'PROPOSED CONCEPT · SYNTHETIC TELEMETRY · NO HARDWARE CONNECTED';

export default function App() {
  const { sim, snap, logs, paused, setPaused, muted, setMuted, alarms, setAlarms, unlock, resetSimulation, setAsset, appendLogs } = useSimulator();
  const [shot, setShot] = useState<CameraShot | null>(null);
  const [slowMo, setSlowMo] = useState(0.08);
  const [kit, setKit] = useState<SensorKit>(CONFIG.sensorKitDefault);
  const [xray, setXray] = useState(false);
  // inspection mode (lifted + exploded part, card on the canvas) and the right-pane spec sheet for that part
  const [inspect, setInspect] = useState<HardwareId | null>(null);
  const [sheet, setSheet] = useState(false);
  const closeSheet = useCallback(() => setSheet(false), []);
  // camera shots follow the active machine's tap points
  const assetRef = useRef<AssetId>(snap.asset);
  assetRef.current = snap.asset;
  const focus = useCallback((name: ShotName) => setShot(makeShot(name, assetRef.current)), []);
  // concept machines always carry the industrial kit; the bench rig can preview it from the inspector
  const effectiveKit: SensorKit = ASSETS[snap.asset].sensorKit === 'bench' ? kit : 'industrial';
  const ml = useAnomaly(sim, snap, appendLogs);
  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const { walk, startWalkthrough, stopWalkthrough } = useWalkthrough(sim, focus, scrollTo, unlock, setXray);

  const enterInspect = useCallback((id: HardwareId) => { setInspect(id); setXray(false); }, []);
  const exitInspect = useCallback(() => {
    setInspect(null);
    setSheet(false);
    setShot(makeShot('rig', assetRef.current));
  }, []);
  const inspectFromList = useCallback((id: HardwareId) => { enterInspect(id); setSheet(true); }, [enterInspect]);
  // frame the lifted part; re-frame when the machine or the sensor kit changes underneath it
  useEffect(() => {
    if (inspect) setShot(inspectShot(inspect, snap.asset, effectiveKit));
  }, [inspect, snap.asset, effectiveKit]);
  const startWalk = useCallback(() => {
    setInspect(null);
    setSheet(false);
    startWalkthrough();
  }, [startWalkthrough]);
  const toggleXray = useCallback(() => {
    if (inspect) { setInspect(null); setSheet(false); }
    setXray((v) => !v);
  }, [inspect]);

  const resetAll = useCallback(() => {
    if (walk.active) stopWalkthrough();
    setInspect(null);
    setSheet(false);
    resetSimulation();
    focus('home');
  }, [walk.active, stopWalkthrough, resetSimulation, focus]);

  const switchAsset = useCallback((id: AssetId) => {
    if (walk.active) stopWalkthrough();
    setAsset(id);
    assetRef.current = id;
    setShot(makeShot('rig', id));
  }, [walk.active, stopWalkthrough, setAsset]);

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
        onStartWalk={startWalk}
        onStopWalk={stopWalkthrough}
        kit={effectiveKit}
        xray={xray}
        onXray={toggleXray}
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
            kit={effectiveKit}
            xray={xray}
            selected={inspect}
            onSelect={enterInspect}
            onAsset={switchAsset}
            onExitInspect={exitInspect}
            onOpenSheet={() => setSheet(true)}
            sheetOpen={sheet}
          />
        </div>
        <div className="relative min-h-0">
          <div className="scroll-thin h-full overflow-y-auto bg-canvas">
            <DashboardPane sim={sim} snap={snap} logs={logs} onUserGesture={unlock} slowMo={slowMo} onSlowMo={setSlowMo} kit={effectiveKit} onInspect={inspectFromList} ml={ml} walkScene={walk.active ? walk.scene : 0} />
          </div>
          <InspectorDrawer id={sheet ? inspect : null} kit={effectiveKit} onKit={setKit} kitLocked={ASSETS[snap.asset].sensorKit !== 'bench'} snap={snap} onClose={closeSheet} />
        </div>
      </main>
    </div>
  );
}
