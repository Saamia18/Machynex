import { CONFIG as C } from './config';
import type { LogLine, PacketRecord } from './engine';

export interface Capture {
  packets: PacketRecord[];
  events: LogLine[];
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
      thresholds_illustrative: {
        vibration_mm_s: { zone_bounds: C.vib.zones, warn: C.vib.warn, critical: C.vib.crit },
        temperature_C: { warn: C.temp.warn, critical: C.temp.crit },
        current_A: { critical: C.current.crit },
        persistence_s: C.persistS,
        hysteresis_s: C.hysteresisS,
      },
      packets: cap.packets.map((p) => ({
        t_s: p.t, state: p.state, zone: p.zone, rpm: p.rpm, imbalance_g: p.massG,
        vibration_mm_s_rms: p.vib, current_A: p.current, temp_C: p.temp, relay_closed: p.relayClosed,
      })),
      events: cap.events.map((e) => ({ t_s: Number(e.t.toFixed(2)), kind: e.kind, text: e.text })),
    },
    null,
    2,
  );
}

export function buildCsv(cap: Capture): string {
  const head = 't_s,state,zone,rpm,imbalance_g,vibration_mm_s_rms,current_A,temp_C,relay_closed,synthetic';
  const rows = cap.packets.map((p) =>
    [p.t, p.state, p.zone, p.rpm, p.massG, p.vib, p.current, p.temp, p.relayClosed ? 1 : 0, 'true'].join(','),
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
