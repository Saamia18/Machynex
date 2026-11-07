import { useCallback, useEffect, useRef, useState } from 'react';
import type { Simulator } from './engine';
import type { ShotName } from './shots';

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

/** total tour length in ms */
export const WALK_END_MS = 50000;

export interface TimelineCtx {
  sim: Simulator;
  focus: (name: ShotName) => void;
  scrollTo: (id: string) => void;
  setScene: (n: number) => void;
}

export interface TimelineStep {
  at: number; // ms from start
  run: () => void;
}

/** Pure schedule of everything the walkthrough does. Used by the hook and by the tests. */
export function buildTimeline(ctx: TimelineCtx): TimelineStep[] {
  const { sim, focus, scrollTo, setScene } = ctx;
  const baselineAt = (at: number): TimelineStep[] => [
    { at, run: () => sim.preset('baseline') },
    { at: at + 1300, run: () => { if (!sim.relayClosed) sim.resetRelay(); } },
  ];
  return [
    // scene 1: baseline, camera on the sensors
    { at: 0, run: () => { setScene(1); focus('sensors'); scrollTo('sec-health'); } },
    ...baselineAt(0),
    // scene 2: progressive imbalance, camera on the bearing, spectrum into view
    { at: 8000, run: () => { setScene(2); focus('bearing'); sim.preset('progressive'); scrollTo('sec-spectrum'); } },
    // scene 3: back to baseline, then a floor bump
    { at: 23000, run: () => { setScene(3); focus('wide'); } },
    ...baselineAt(23000),
    { at: 26500, run: () => { sim.preset('shock'); scrollTo('sec-terminal'); } },
    // scene 4: overload and trip
    { at: 34000, run: () => { setScene(4); focus('trip'); sim.preset('critical'); scrollTo('sec-health'); } },
  ];
}

export function useWalkthrough(
  sim: Simulator,
  focus: (name: ShotName) => void,
  scrollTo: (id: string) => void,
  unlock: () => void,
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
    const s = SCENES[n - 1];
    setState((p) => ({ ...p, active: true, scene: n, title: s.title, caption: s.caption }));
  }, []);

  const start = useCallback(() => {
    clearAll();
    unlock();
    startedAt.current = performance.now();
    setState({ active: true, scene: 1, total: 4, title: SCENES[0].title, caption: SCENES[0].caption, progress: 0 });
    for (const step of buildTimeline({ sim, focus, scrollTo, setScene })) {
      timers.current.push(window.setTimeout(step.run, step.at));
    }
    timers.current.push(window.setTimeout(() => { clearAll(); setState(IDLE); }, WALK_END_MS));
    interval.current = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - startedAt.current) / WALK_END_MS);
      setState((s) => (s.active ? { ...s, progress: p } : s));
    }, 100);
  }, [clearAll, focus, scrollTo, setScene, sim, unlock]);

  /** stop early: put the demo back to a clean, running baseline */
  const stop = useCallback(() => {
    clearAll();
    setState(IDLE);
    focus('home');
    sim.preset('baseline');
    timers.current.push(window.setTimeout(() => { if (!sim.relayClosed) sim.resetRelay(); }, 1300));
  }, [clearAll, focus, sim]);

  useEffect(() => clearAll, [clearAll]);

  return { walk: state, startWalkthrough: start, stopWalkthrough: stop };
}
