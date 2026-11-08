import { useCallback, useEffect, useRef, useState } from 'react';
import type { Simulator } from './engine';
import type { ShotName } from './shots';
import type { AssetProfile } from './assets';
import { CONCEPT_ASSET_TAG } from './assets';

export interface WalkState {
  active: boolean;
  scene: number; // 1..4
  total: number;
  title: string;
  caption: string;
  progress: number; // 0..1 of the whole tour
}

const IDLE: WalkState = { active: false, scene: 0, total: 4, title: '', caption: '', progress: 0 };

export const SCENES = [
  {
    title: 'Baseline nominal',
    caption:
      'Healthy rig at 1450 rpm. The MPU6050 and DS18B20 stream to the ESP32, and every reading sits inside the baseline band. All data here is synthetic.',
  },
  {
    title: 'Progressive imbalance',
    caption:
      'The eccentric mass grows from 0.15 g to 0.65 g. Watch the bearing shake and the 1X spectrum peak rise until the state moves to Early Warning.',
  },
  {
    title: 'Floor bump rejection',
    caption:
      'A 300 ms knock spikes the vibration reading, but it is shorter than the persistence window and nothing else agrees. The terminal logs the filter and the state does not change.',
  },
  {
    title: 'Critical overload and relay trip',
    caption:
      'Vibration, current and temperature spike. After the 1 s persistence window the simulated safety cut-off opens, the red LED latches and the motor spins down.',
  },
];

/** asset-aware captions (same four scenes and timing for every asset) */
export function scenesFor(p: AssetProfile): { title: string; caption: string }[] {
  if (p.id === 'bench-dc') return SCENES;
  const concept = ` ${CONCEPT_ASSET_TAG}.`;
  return [
    {
      title: 'Baseline nominal',
      caption: `${p.shortName} at ${p.nominal.rpm} rpm. The X-ray view opens the edge node: sensor harnesses enter through the glands, every reading sits inside the baseline band. All data is synthetic.${concept}`,
    },
    {
      title: `Progressive fault: ${p.faultName}`,
      caption: p.spectrum.model === 'pitting'
        ? 'Pitting grows the gear-mesh peak and its 1X sidebands (tooth counts assumed). Vibration rises until the state moves to Early Warning.'
        : p.spectrum.model === 'cavitation'
          ? 'Cavitation lifts the broadband floor while motor current drops. Vibration rises until the state moves to Early Warning. Real cavitation energy extends above the proposed sensor bandwidth.'
          : 'The eccentric mass grows. Watch the 1X spectrum peak rise until the state moves to Early Warning.',
    },
    SCENES[2],
    {
      title: 'Critical fault and interlock trip',
      caption: 'Vibration and temperature spike. After the 1 s persistence window the simulated safety cut-off opens on the edge node, its state LED turns red and the shaft spins down in about 2.5 s.',
    },
  ];
}

/** total tour length in ms */
export const WALK_END_MS = 50000;

export interface TimelineCtx {
  sim: Simulator;
  focus: (name: ShotName) => void;
  scrollTo: (id: string) => void;
  setScene: (n: number) => void;
  /** optional: open the X-ray / enclosure view (scene 1 shows the node interior for 4 s) */
  setXray?: (on: boolean) => void;
}

export interface TimelineStep {
  at: number; // ms from start
  run: () => void;
}

/** Pure schedule of everything the walkthrough does. Used by the hook and by the tests. */
export function buildTimeline(ctx: TimelineCtx): TimelineStep[] {
  const { sim, focus, scrollTo, setScene } = ctx;
  const xray = (on: boolean) => ctx.setXray?.(on);
  const baselineAt = (at: number): TimelineStep[] => [
    { at, run: () => sim.preset('baseline') },
    { at: at + 1300, run: () => { if (!sim.relayClosed) sim.resetRelay(); } },
  ];
  return [
    // scene 1: baseline; edge node close-up with the enclosure open (X-ray) for 4 s, then the full rig
    { at: 0, run: () => { setScene(1); focus('nodeMacro'); xray(true); scrollTo('sec-health'); } },
    ...baselineAt(0),
    { at: 4000, run: () => { xray(false); focus('rig'); } },
    // scene 2: progressive fault, camera on the vibration pod, spectrum into view
    { at: 8000, run: () => { setScene(2); xray(false); focus('puck'); sim.preset('progressive'); scrollTo('sec-spectrum'); } },
    // scene 3: back to baseline, then a floor knock (full rig; the terminal logs the rejection)
    { at: 23000, run: () => { setScene(3); focus('rig'); } },
    ...baselineAt(23000),
    { at: 26500, run: () => { sim.preset('shock'); scrollTo('sec-terminal'); } },
    // scene 4: critical fault and trip, camera on the edge node (cut-off state LED)
    { at: 34000, run: () => { setScene(4); focus('nodeMacro'); sim.preset('critical'); scrollTo('sec-health'); } },
  ];
}

export function useWalkthrough(
  sim: Simulator,
  focus: (name: ShotName) => void,
  scrollTo: (id: string) => void,
  unlock: () => void,
  setXray?: (on: boolean) => void,
) {
  const [state, setState] = useState<WalkState>(IDLE);
  const timers = useRef<number[]>([]);
  const interval = useRef<number | null>(null);
  const startedAt = useRef(0);

  const clearAll = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    if (interval.current !== null) {
      window.clearInterval(interval.current);
      interval.current = null;
    }
  }, []);

  const setScene = useCallback((n: number) => {
    const s = scenesFor(sim.profile)[n - 1];
    setState((p) => ({ ...p, active: true, scene: n, title: s.title, caption: s.caption }));
  }, []);

  const start = useCallback(() => {
    clearAll();
    unlock();
    startedAt.current = performance.now();
    const first = scenesFor(sim.profile)[0];
    setState({ active: true, scene: 1, total: 4, title: first.title, caption: first.caption, progress: 0 });
    for (const step of buildTimeline({ sim, focus, scrollTo, setScene, setXray })) {
      timers.current.push(window.setTimeout(step.run, step.at));
    }
    timers.current.push(window.setTimeout(() => { clearAll(); setState(IDLE); }, WALK_END_MS));
    interval.current = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - startedAt.current) / WALK_END_MS);
      setState((s) => (s.active ? { ...s, progress: p } : s));
    }, 100);
  }, [clearAll, focus, scrollTo, setScene, setXray, sim, unlock]);

  /** stop early: put the demo back to a clean, running baseline */
  const stop = useCallback(() => {
    clearAll();
    setState(IDLE);
    setXray?.(false);
    focus('home');
    sim.preset('baseline');
    timers.current.push(window.setTimeout(() => { if (!sim.relayClosed) sim.resetRelay(); }, 1300));
  }, [clearAll, focus, setXray, sim]);

  useEffect(() => clearAll, [clearAll]);

  return { walk: state, startWalkthrough: start, stopWalkthrough: stop };
}
