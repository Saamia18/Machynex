import type { Simulator } from './engine';

/** largest slice handed to Simulator.step() in one call (it caps a single call at 0.25 s / 8 ticks) */
export const SLICE_S = 0.1;
/** most simulated time advanced for one rendered frame; longer gaps (background tab, debugger) are dropped */
export const MAX_CATCH_UP_S = 1.0;

/**
 * Advance the simulation by the real elapsed time of one rendered frame.
 * The engine runs fixed 0.05 s ticks internally; this only makes sure a slow frame (low fps, software GL)
 * still advances the full wall-clock time, so persistence windows and trips happen in real time.
 * Returns the simulated seconds actually requested.
 */
export function advanceRealTime(sim: Pick<Simulator, 'step'>, dtReal: number): number {
  let remaining = Math.min(Math.max(0, dtReal), MAX_CATCH_UP_S);
  const total = remaining;
  while (remaining > 1e-9) {
    const slice = Math.min(SLICE_S, remaining);
    sim.step(slice);
    remaining -= slice;
  }
  return total;
}
