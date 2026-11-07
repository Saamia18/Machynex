import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export interface LabelPoint { x: number; y: number; vis: boolean }
export interface LabelRegistry {
  points: Record<string, LabelPoint>;
  cam: { x: number; z: number; tx: number; tz: number };
  size: { w: number; h: number };
}

export interface LabelItem {
  id: string;
  title: string;
  value: string;
  sub?: string;
  tone: 'cyan' | 'amber' | 'red' | 'green' | 'zinc';
  priority: number; // higher keeps its place when crowded
  enabled: boolean;
}

const TONE_BORDER: Record<LabelItem['tone'], string> = {
  cyan: 'border-cyan-500/60', amber: 'border-amber-500/70', red: 'border-red-500/70', green: 'border-emerald-500/60', zinc: 'border-zinc-600',
};
const TONE_DOT: Record<LabelItem['tone'], string> = {
  cyan: '#22d3ee', amber: '#f59e0b', red: '#ef4444', green: '#34d399', zinc: '#a1a1aa',
};

interface Rect { x: number; y: number; w: number; h: number }
const overlaps = (a: Rect, b: Rect, m = 6) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;

/**
 * Screen-space label layer. Anchors are projected by the 3D scene each frame; here each chip is placed
 * next to its anchor, trying several offsets so chips never overlap each other. If no free spot exists
 * the lowest-priority chip is hidden (its anchor dot stays) until the camera moves.
 */
export function LabelLayer({ registry, items }: { registry: { current: LabelRegistry }; items: LabelItem[] }) {
  const root = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lineRefs = useRef<Record<string, SVGLineElement | null>>({});
  const pos = useRef<Record<string, { x: number; y: number }>>({});
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const reg = registry.current;
      const W = reg.size.w;
      const H = reg.size.h;
      const placed: Rect[] = [];
      const sorted = [...itemsRef.current].sort((a, b) => b.priority - a.priority);
      for (const it of sorted) {
        const chip = chipRefs.current[it.id];
        const dot = dotRefs.current[it.id];
        const line = lineRefs.current[it.id];
        if (!chip || !dot || !line) continue;
        const p = reg.points[it.id];
        if (!it.enabled || !p || !p.vis) {
          chip.style.opacity = '0'; chip.style.pointerEvents = 'none';
          dot.style.opacity = '0'; line.style.opacity = '0';
          continue;
        }
        const w = chip.offsetWidth;
        const h = chip.offsetHeight;
        const cands: [number, number][] = [
          [16, -h - 12], [-w - 16, -h - 12], [16, 12], [-w - 16, 12],
          [16, -h - 52], [-w - 16, -h - 52], [16, 52], [-w - 16, 52],
          [-w / 2, -h - 28], [-w / 2, 28], [16, -h - 92], [-w - 16, -h - 92],
        ];
        let chosen: Rect | null = null;
        for (const [dx, dy] of cands) {
          const r: Rect = { x: p.x + dx, y: p.y + dy, w, h };
          if (r.x < 4 || r.y < 44 || r.x + w > W - 4 || r.y + h > H - 4) continue;
          if (placed.some((q) => overlaps(r, q))) continue;
          chosen = r;
          break;
        }
        dot.style.opacity = '1';
        dot.style.transform = `translate(${p.x - 4}px, ${p.y - 4}px)`;
        if (!chosen) {
          chip.style.opacity = '0'; chip.style.pointerEvents = 'none'; line.style.opacity = '0';
          continue;
        }
        placed.push(chosen);
        const cur = pos.current[it.id] ?? { x: chosen.x, y: chosen.y };
        cur.x += (chosen.x - cur.x) * 0.35;
        cur.y += (chosen.y - cur.y) * 0.35;
        pos.current[it.id] = cur;
        chip.style.opacity = '1';
        chip.style.pointerEvents = 'auto';
        chip.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
        const lx = Math.min(Math.max(p.x, cur.x), cur.x + w);
        const ly = Math.min(Math.max(p.y, cur.y), cur.y + h);
        line.setAttribute('x1', String(p.x)); line.setAttribute('y1', String(p.y));
        line.setAttribute('x2', String(lx)); line.setAttribute('y2', String(ly));
        line.style.opacity = '0.7';
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [registry]);

  const body: ReactNode = items.map((it) => (
    <div key={it.id}>
      <div
        ref={(el) => { dotRefs.current[it.id] = el; }}
        className="absolute left-0 top-0 h-2 w-2 rounded-full opacity-0"
        style={{ background: TONE_DOT[it.tone], boxShadow: `0 0 8px ${TONE_DOT[it.tone]}` }}
      />
      <div
        ref={(el) => { chipRefs.current[it.id] = el; }}
        className={`group absolute left-0 top-0 select-none whitespace-nowrap rounded-md border ${TONE_BORDER[it.tone]} bg-zinc-950/85 px-2 py-1 text-[11px] leading-tight text-zinc-200 opacity-0 shadow-lg backdrop-blur`}
      >
        <div className="font-semibold text-zinc-100">{it.title}</div>
        <div className="mono text-cyan-300">{it.value}</div>
        {it.sub && <div className="hidden max-w-[210px] whitespace-normal text-[10px] text-zinc-400 group-hover:block">{it.sub}</div>}
      </div>
    </div>
  ));

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 h-full w-full">
        {items.map((it) => (
          <line key={it.id} ref={(el) => { lineRefs.current[it.id] = el; }} stroke={TONE_DOT[it.tone]} strokeWidth={1} opacity={0} />
        ))}
      </svg>
      {body}
    </div>
  );
}
