import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { ShotName } from '../sim/shots';

// Compact "View" dropdown used in the header below 1500 px: camera presets + X-ray toggle.
// Keyboard: Enter/Space/ArrowDown open, ArrowUp/ArrowDown move, Esc closes and returns focus to the trigger.

interface Props {
  presets: { id: ShotName; label: string }[];
  activeShot: ShotName | null;
  onFocus: (n: ShotName) => void;
  xray: boolean;
  onXray: () => void;
}

const item = 'flex h-7 w-full items-center gap-2 px-2.5 text-left text-xs text-zinc-300 outline-none hover:bg-zinc-900 hover:text-zinc-100 focus-visible:bg-zinc-800 focus-visible:text-zinc-100';

export function ViewMenu({ presets, activeShot, onFocus, xray, onXray }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items.current.filter(Boolean) as HTMLButtonElement[];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }}
        className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-zinc-300 outline-none hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-zinc-400"
      >
        View{xray && <span className="font-mono text-[10px] text-zinc-500">· X-RAY</span>}<ChevronDown size={12} className="text-zinc-500" />
      </button>
      {open && (
        <div role="menu" aria-label="View" onKeyDown={onMenuKey} className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-md border border-line bg-panel py-0.5">
          {presets.map((p, i) => (
            <button
              key={p.id}
              ref={(el) => { items.current[i] = el; }}
              type="button"
              role="menuitemradio"
              aria-checked={activeShot === p.id}
              onClick={() => { onFocus(p.id); close(); }}
              className={item}
            >
              <span className="w-3">{activeShot === p.id && <Check size={12} />}</span>{p.label}
            </button>
          ))}
          <div className="my-0.5 h-px bg-zinc-800" role="separator" />
          <button
            ref={(el) => { items.current[presets.length] = el; }}
            type="button"
            role="menuitemcheckbox"
            aria-checked={xray}
            onClick={() => { onXray(); close(); }}
            className={item}
          >
            <span className="w-3">{xray && <Check size={12} />}</span>X-Ray View
          </button>
        </div>
      )}
    </div>
  );
}
