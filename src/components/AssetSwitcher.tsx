import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { ASSETS, ASSET_IDS } from '../sim/assets';
import type { AssetId } from '../sim/assets';

// Slim machine selector docked at the top centre of the 3D canvas.
// Flat: #121215 panel, 1px hairline border, radius <= 6px, no shadow/glow/blur, no cyan.

export const ASSET_SHORT: Record<AssetId, string> = {
  'bench-dc': 'Bench rig',
  'induction-05hp': 'Induction',
  'slurry-pump': 'Pump',
  'helical-gearbox': 'Gearbox',
};

/** long explanation shown only inside the (i) popover */
export const CONCEPT_ASSET_TEXT = 'Illustrative fault model. Not validated. Industrial-retrofit sensor kit is not in the proposed bill of materials.';
export const KIT_PREVIEW_TEXT =
  'Industrial-retrofit sensor kit previewed on the DC bench rig. Not in the proposed bill of materials. The CT clamp is AC only and could not measure this DC lead.';
export const WALK_LOCK_TIP = 'Stop the walkthrough to switch';

const focusRing = 'outline-none focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-zinc-400';

interface Props {
  asset: AssetId;
  onChange: (id: AssetId) => void;
  /** true while the evaluator walkthrough runs */
  disabled?: boolean;
  /** narrow canvas: a single "Asset: <name>" dropdown instead of four segments */
  compact?: boolean;
  /** bench rig showing the industrial kit preview (gets its own marker) */
  kitPreview?: boolean;
  /** start with the (i) popover open (server-render tests only) */
  initialInfoOpen?: boolean;
}

function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open, close, ref]);
}

/** four radios with roving tabindex; Left/Right move and select */
function Radios({ asset, onChange, disabled, onPicked }: { asset: AssetId; onChange: (id: AssetId) => void; disabled: boolean; onPicked?: () => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const pick = (id: AssetId) => {
    if (disabled) return;
    if (id !== asset) onChange(id);
    onPicked?.();
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (disabled || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    e.preventDefault();
    const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + ASSET_IDS.length) % ASSET_IDS.length;
    refs.current[n]?.focus();
    pick(ASSET_IDS[n]);
  };
  return (
    <>
      {ASSET_IDS.map((id, i) => {
        const on = id === asset;
        return (
          <button
            key={id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={disabled || undefined}
            tabIndex={on ? 0 : -1}
            title={disabled ? WALK_LOCK_TIP : ASSETS[id].name}
            onClick={() => pick(id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`whitespace-nowrap px-2.5 text-xs transition-colors ${focusRing} ${i > 0 ? 'border-l border-line' : ''} ${on ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            {ASSET_SHORT[id]}
          </button>
        );
      })}
    </>
  );
}

export function AssetSwitcher({ asset, onChange, disabled = false, compact = false, kitPreview = false, initialInfoOpen = false }: Props) {
  const [menu, setMenu] = useState(false);
  const [info, setInfo] = useState(initialInfoOpen);
  const menuRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  useDismiss(menu, () => setMenu(false), menuRef);
  useDismiss(info, () => setInfo(false), infoRef);
  useEffect(() => { if (disabled) setMenu(false); }, [disabled]);

  const concept = ASSETS[asset].scope === 'concept';
  const marker = concept ? 'CONCEPT' : kitPreview ? 'KIT PREVIEW' : null;
  const markerText = concept ? CONCEPT_ASSET_TEXT : KIT_PREVIEW_TEXT;

  return (
    <div className="flex items-center gap-1.5">
      {compact ? (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-haspopup="true"
            aria-expanded={menu}
            aria-disabled={disabled || undefined}
            title={disabled ? WALK_LOCK_TIP : 'Switch machine'}
            onClick={() => { if (!disabled) setMenu((v) => !v); }}
            className={`flex h-7 items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 text-xs text-zinc-200 hover:text-zinc-100 ${focusRing} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <span className="text-zinc-500">Asset:</span>{ASSET_SHORT[asset]}<ChevronDown size={12} className="text-zinc-500" />
          </button>
          {menu && (
            <div role="radiogroup" aria-label="Machine" className="absolute left-1/2 top-full z-20 mt-1 flex -translate-x-1/2 flex-col overflow-hidden rounded-md border border-line bg-panel py-0.5 [&>button]:h-7 [&>button]:border-l-0 [&>button]:text-left">
              <Radios asset={asset} onChange={onChange} disabled={disabled} onPicked={() => setMenu(false)} />
            </div>
          )}
        </div>
      ) : (
        <div
          role="radiogroup"
          aria-label="Machine"
          aria-disabled={disabled || undefined}
          title={disabled ? WALK_LOCK_TIP : undefined}
          className="flex h-7 items-stretch overflow-hidden rounded-md border border-line bg-panel"
        >
          <Radios asset={asset} onChange={onChange} disabled={disabled} />
        </div>
      )}

      {marker && (
        <div ref={infoRef} className="relative flex items-center gap-1">
          <span className="font-mono flex h-5 items-center rounded-sm border border-line bg-panel px-1.5 text-[10px] uppercase tracking-wider text-zinc-400">{marker}</span>
          <button
            type="button"
            aria-label={`About this ${concept ? 'concept machine' : 'kit preview'}`}
            aria-expanded={info}
            onClick={() => setInfo((v) => !v)}
            className={`flex h-7 w-7 items-center justify-center rounded-md border border-line bg-panel text-zinc-400 hover:text-zinc-100 ${focusRing}`}
          >
            <Info size={13} />
          </button>
          {info && (
            <div role="dialog" aria-label={marker} className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-line bg-panel px-3 py-2 text-[11px] leading-snug text-zinc-300">
              <div className="mb-0.5 text-zinc-100">{ASSETS[asset].name}</div>
              {markerText}
            </div>
          )}
        </div>
      )}

      <span className="sr-only" aria-live="polite">{`Machine: ${ASSETS[asset].name}`}</span>
    </div>
  );
}
