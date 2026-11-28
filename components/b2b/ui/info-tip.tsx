'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MAX_WIDTH = 300;
const EDGE = 8;
const GAP = 6;
const ROOM_BELOW = 160;

interface Spot { x: number; y: number; above: boolean }

export function Hint({ text }: { text: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(null);
  const id = useId();
  const open = hover || pinned;

  useLayoutEffect(() => {
    if (!open || !ref.current) { setSpot(null); return; }
    const r = ref.current.getBoundingClientRect();
    const half = Math.min(MAX_WIDTH, window.innerWidth - EDGE * 2) / 2;
    const x = Math.max(EDGE + half, Math.min(r.left + r.width / 2, window.innerWidth - EDGE - half));
    const above = r.bottom + ROOM_BELOW > window.innerHeight;
    setSpot({ x, y: above ? r.top - GAP : r.bottom + GAP, above });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => { setPinned(false); setHover(false); };
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setPinned(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label="What this means"
        aria-describedby={open ? id : undefined}
        aria-expanded={pinned}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => { setHover(false); setPinned(false); }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPinned((p) => !p); }}
        className={`inline-flex shrink-0 items-center justify-center w-4 h-4 rounded-full border text-[9px] font-semibold leading-none cursor-pointer select-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0F766E] ${
          open ? 'border-gray-700 bg-gray-700 text-white' : 'border-gray-300 text-gray-400 hover:border-gray-500 hover:text-gray-600'
        }`}
      >
        i
      </button>
      {open && spot && createPortal(
        <div
          role="tooltip"
          id={id}
          style={{
            position: 'fixed', left: spot.x, top: spot.y, maxWidth: MAX_WIDTH,
            transform: `translate(-50%, ${spot.above ? '-100%' : '0'})`,
          }}
          className="z-[2000] w-max rounded-md bg-gray-900 px-3 py-2 text-[12px] font-normal normal-case tracking-normal leading-snug text-white shadow-lg pointer-events-none whitespace-pre-line"
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}
