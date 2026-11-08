import { CONFIG as C } from './config';
import type { LogLine, PacketRecord } from './engine';

export interface CaptureAsset {
  id: string;
  scope: 'proposal' | 'concept';
  name: string;
  faultName: string;
  conceptTag: string | null;
  thresholds: { vibWarn: number; vibCrit: number; zones: readonly number[]; tempWarn: number; tempCrit: number; curCrit: number };
}

export interface Capture {
  packets: PacketRecord[];
  events: LogLine[];
  /** asset metadata (Phase 3). Absent in old captures: treated as the bench rig. */
  asset?: CaptureAsset;
}

const DISCLAIMER =
  'SYNTHETIC DATA from the Machynex concept digital twin. No hardware was connected and nothing here was measured.';

export function buildJson(cap: Capture, generatedAt: Date = new Date()): string {
  return JSON.stringify(
    {
      synthetic: true,
      disclaimer: DISCLAIMER,
      generated_at: generatedAt.toISOString(),
      packet_rate_hz: 2,
      asset: cap.asset
        ? { asset_id: cap.asset.id, asset_scope: cap.asset.scope, name: cap.asset.name, fault: cap.asset.faultName, concept_tag: cap.asset.conceptTag }
        : { asset_id: 'bench-dc', asset_scope: 'proposal', name: 'Bench rig', fault: 'Rotor mass unbalance', concept_tag: null },
      thresholds_illustrative: {
        vibration_mm_s: { zone_bounds: cap.asset?.thresholds.zones ?? C.vib.zones, warn: cap.asset?.thresholds.vibWarn ?? C.vib.warn, critical: cap.asset?.thresholds.vibCrit ?? C.vib.crit },
        temperature_C: { warn: cap.asset?.thresholds.tempWarn ?? C.temp.warn, critical: cap.asset?.thresholds.tempCrit ?? C.temp.crit },
        current_A: { critical: cap.asset?.thresholds.curCrit ?? C.current.crit },
        persistence_s: C.persistS,
        hysteresis_s: C.hysteresisS,
      },
      packets: cap.packets.map((p) => ({
        t_s: p.t, state: p.state, zone: p.zone, rpm: p.rpm, imbalance_g: p.massG, fault_severity: p.severity,
        vibration_mm_s_rms: p.vib, current_A: p.current, temp_C: p.temp, relay_closed: p.relayClosed,
      })),
      events: cap.events.map((e) => ({ t_s: Number(e.t.toFixed(2)), kind: e.kind, text: e.text })),
    },
    null,
    2,
  );
}

/**
 * CSV export. The default keeps the original 10-column layout (existing tooling and tests rely on it);
 * `includeAsset` appends asset_id, asset_scope and fault_severity columns. The dashboard always exports with them.
 */
export function buildCsv(cap: Capture, opts: { includeAsset?: boolean } = {}): string {
  const extra = !!opts.includeAsset;
  const id = cap.asset?.id ?? 'bench-dc';
  const scope = cap.asset?.scope ?? 'proposal';
  const head = 't_s,state,zone,rpm,imbalance_g,vibration_mm_s_rms,current_A,temp_C,relay_closed,synthetic' + (extra ? ',asset_id,asset_scope,fault_severity' : '');
  const rows = cap.packets.map((p) =>
    [p.t, p.state, p.zone, p.rpm, p.massG, p.vib, p.current, p.temp, p.relayClosed ? 1 : 0, 'true', ...(extra ? [id, scope, p.severity] : [])].join(','),
  );
  return [head, ...rows].join('\n') + '\n';
}

export function stamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function downloadText(filename: string, text: string, mime: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
