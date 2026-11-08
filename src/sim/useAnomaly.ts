import { useEffect, useRef, useState } from 'react';
import type { LogLine, Simulator, Snapshot } from './engine';
import type { AssetId } from './assets';
import { AnomalyMonitor, extractFeatures, trainModel } from './dashboardML';
import type { MlStatus, TrainedModel } from './dashboardML';

export interface AnomalyView {
  status: MlStatus | null;
  training: boolean;
  model: TrainedModel | null;
}

/**
 * Runs the client-side anomaly monitor next to the simulation: trains on the asset's synthetic baseline (deferred so the
 * UI stays responsive), then scores the latest 1 s window every time a new snapshot is published (~10 Hz).
 */
export function useAnomaly(sim: Simulator, snap: Snapshot, appendLogs: (l: { kind: LogLine['kind']; t: number; text: string }[]) => void): AnomalyView {
  const [view, setView] = useState<AnomalyView>({ status: null, training: true, model: null });
  const mon = useRef<AnomalyMonitor | null>(null);
  const lastT = useRef(-1);
  const asset: AssetId = snap.asset;

  useEffect(() => {
    let cancelled = false;
    mon.current = null;
    setView({ status: null, training: true, model: null });
    const id = window.setTimeout(() => {
      const model = trainModel(asset);
      if (cancelled) return;
      mon.current = new AnomalyMonitor(model);
      lastT.current = -1;
      setView({ status: null, training: false, model });
    }, 30);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [asset]);

  useEffect(() => {
    let m = mon.current;
    if (!m) return;
    if (snap.t < lastT.current) m = mon.current = new AnomalyMonitor(m.model); // Reset Simulation rewound the clock
    lastT.current = snap.t;
    const events = m.update(extractFeatures(sim), snap.t);
    if (events.length) appendLogs(events.map((e) => ({ kind: e.kind === 'rejected' ? 'FILTER' : 'STATE', t: e.t, text: e.text })));
    // capture now: the updater runs later, when an asset switch may already have cleared mon.current
    const status = m.status;
    setView((v) => ({ ...v, status }));
  }, [snap, sim, appendLogs]);

  return view;
}
