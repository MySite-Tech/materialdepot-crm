'use client';

/* The filter chrome the two COE call queues share — a date-range picker, a
   category multi-select, and the "frozen" summary bar the queues pin to the top
   of the viewport.

   These live here rather than in each tab because the Followups and Install
   Reviews tables are structural mirrors of one another (see the header comment
   in InstallReviews.tsx) and the whole point of putting the same two filters on
   both is that they behave identically. A second hand-written copy of a date
   preset list is how the two tabs end up disagreeing about what "Last 30 days"
   means. */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  CATEGORY_ORDER, CATEGORY_TONE, CAT_UNSET, DATE_PRESETS, fmtRangeLabel, presetRange,
  type DatePresetKey, type DateRange,
} from './shared';

/* ── Frozen summary bar ───────────────────────────────────────────────────
   The COE works a queue of hundreds of rows and reads the bucket counts and the
   search box against whichever row is on screen, so both have to stay put while
   the table scrolls (requested 2026-09-01).

   `position: sticky` is measured against the nearest scrolling ancestor, which
   here is the document — but every host that mounts this dashboard has its OWN
   sticky header above it, at a height this component cannot know:
   `app/App.tsx`'s is a fixed 48px, `/site-audit-view`'s wraps and so changes
   height with the window. Hard-coding either number puts the bar under one
   host's header or leaves a gap under the other's, so the offset is MEASURED:
   walk up the ancestors, and for every preceding sibling that is itself pinned
   to the top of the viewport, add its height. Nothing found (a host with no
   sticky header) yields 0, which is the correct answer rather than a fallback. */
function measureStickyTop(el: HTMLElement | null): number {
  let total = 0;
  for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
    for (let prev = node.previousElementSibling; prev; prev = prev.previousElementSibling) {
      if (!(prev instanceof HTMLElement)) continue;
      const cs = getComputedStyle(prev);
      if (cs.position !== 'sticky' && cs.position !== 'fixed') continue;
      const top = parseFloat(cs.top);
      // Only headers pinned at (or above) the top edge sit in our way; a
      // `sticky bottom-0` footer must not push us down.
      if (!Number.isFinite(top) || top > 0) continue;
      total += prev.offsetHeight + top;
    }
  }
  return Math.max(0, Math.round(total));
}

export type FrozenBarGeometry = {
  ref: (el: HTMLDivElement | null) => void;
  /* Where the bar pins — the summed height of the host's own sticky headers. */
  top: number;
};

export function useFrozenBar(): FrozenBarGeometry {
  const [top, setTop] = useState(0);
  const node = useRef<HTMLDivElement | null>(null);

  const remeasure = () => {
    const next = measureStickyTop(node.current);
    setTop((cur) => (cur === next ? cur : next));
  };

  // Layout effect so the first paint already carries the right offset — a bar
  // that jumps 65px after mount reads as a rendering bug.
  useLayoutEffect(remeasure);

  useEffect(() => {
    /* /site-audit-view's host header WRAPS, so its height is a function of the
       window width — this is not a one-time measurement. */
    window.addEventListener('resize', remeasure);
    return () => window.removeEventListener('resize', remeasure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ref: (el) => { node.current = el; },
    top,
  };
}

export function FrozenBar({ top, setRef, children }: { top: number; setRef: (el: HTMLDivElement | null) => void; children: React.ReactNode }) {
  return (
    <div
      ref={setRef}
      style={{ top }}
      /* Opaque background and a shadow, because rows scroll UNDER this rather
         than behind a gap. z-[40] clears the table's own sticky thead (z-10)
         and stays well below the drawers (z-[900]). */
      className="sticky z-[40] -mx-1 mb-3 border-b border-gray-200 bg-[#FAFAFA] px-1 pb-2 pt-1 shadow-[0_6px_10px_-8px_rgba(0,0,0,0.25)]"
    >
      {children}
    </div>
  );
}

/* ── Bucket tiles ─────────────────────────────────────────────────────────
   Deliberately shorter than the cards they replace (requested with the freeze:
   a pinned bar that eats a third of the viewport defeats the point). Same
   click-to-filter behaviour and the same colour coding as before. */
export function BucketTiles<K extends string>({ buckets, counts, active, onPick }: {
  buckets: Array<{ k: K; l: string }>;
  counts: Record<string, number>;
  active: K;
  onPick: (k: K) => void;
}) {
  const tone = (k: string) =>
    k === 'overdue' ? 'text-red-600'
      : k === 'today' ? 'text-amber-600'
        : k === 'converted' || k === 'done' ? 'text-green-700'
          : 'text-[#1F3A5F]';
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
      {buckets.map((b) => (
        <button
          key={b.k}
          onClick={() => onPick(b.k)}
          className={`rounded-md border px-2 py-1.5 text-left ${active === b.k ? 'border-[#1F3A5F] bg-[#eef3f9]' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
        >
          <div className={`text-[15px] font-extrabold leading-none ${tone(b.k)}`}>{counts[b.k] || 0}</div>
          <div className="mt-0.5 truncate text-[10px] font-semibold leading-tight text-gray-500">{b.l}</div>
        </button>
      ))}
    </div>
  );
}

const PILL = 'flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-gray-700 hover:border-gray-400';

/* ── Date range ───────────────────────────────────────────────────────────
   `label` names what the range is measured on, because the two queues filter
   different dates — the audit visit vs the installation completion — and a
   picker that just says "Last 30 days" leaves the COE guessing which. */
export function DateRangeFilter({ label, preset, range, onChange }: {
  label: string;
  preset: DatePresetKey;
  range: DateRange;
  onChange: (preset: DatePresetKey, range: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  useEffect(() => { setFrom(range.from); setTo(range.to); }, [range.from, range.to, open]);

  const active = preset !== 'all';
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className={active ? PILL + ' !border-[#1F3A5F] !bg-[#eef3f9] !text-[#1F3A5F]' : PILL}>
        <span>📅</span>
        {fmtRangeLabel(preset, range)}
        <span className="text-[9px] opacity-60">▾</span>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-[61] mt-1.5 min-w-[268px] rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
            <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
            {DATE_PRESETS.map((p) => (
              <button
                key={p.k}
                onClick={() => { onChange(p.k, presetRange(p.k)); setOpen(false); }}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-gray-50 ${preset === p.k ? 'font-semibold text-gray-900' : 'text-gray-600'}`}
              >
                {p.l}{preset === p.k ? <span className="text-blue-500">✓</span> : null}
              </button>
            ))}
            <div className="mt-2 flex gap-2 border-t border-gray-100 pt-2">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px] outline-none" />
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px] outline-none" />
            </div>
            <button
              onClick={() => { if (from && to && from <= to) { onChange('custom', { from, to }); setOpen(false); } }}
              disabled={!from || !to || from > to}
              className="mt-2 w-full rounded-md bg-[#1F3A5F] py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
            >
              Apply custom range
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ── Category multi-select ────────────────────────────────────────────────
   Every canonical category is offered whether or not the loaded rows contain it:
   an option that vanishes when its count hits zero is how somebody concludes a
   material was never audited, when in fact they had another filter on. Counts
   are shown instead, and they come from the caller's already-filtered rows. */
export function CategoryFilter({ selected, counts, onChange }: {
  selected: string[];
  counts: Record<string, number>;
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = [...CATEGORY_ORDER, CAT_UNSET];
  const toggle = (c: string) => onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);
  const label = selected.length === 0 ? 'All categories' : selected.length === 1 ? selected[0] : selected.length + ' categories';
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className={selected.length ? PILL + ' !border-[#1F3A5F] !bg-[#eef3f9] !text-[#1F3A5F]' : PILL}>
        <span>🏷️</span>
        {label}
        <span className="text-[9px] opacity-60">▾</span>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-[61] mt-1.5 min-w-[240px] rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
            {options.map((c) => {
              const on = selected.includes(c);
              return (
                <button key={c} onClick={() => toggle(c)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-gray-700 hover:bg-gray-50">
                  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? 'border-[#1F3A5F] bg-[#1F3A5F]' : 'border-gray-300'}`}>
                    {on ? <span className="text-[9px] leading-none text-white">✓</span> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c}</span>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-gray-400">{counts[c] || 0}</span>
                </button>
              );
            })}
            <div className="mt-2 flex justify-between border-t border-gray-100 pt-2">
              <button onClick={() => onChange([])} className="text-[12.5px] font-semibold text-gray-500 hover:text-gray-700">Clear</button>
              <button onClick={() => setOpen(false)} className="text-[12.5px] font-semibold text-blue-600">Done</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* Category pills for a table cell. `—` rather than a "Not recorded" pill: the
   filter needs that bucket to have a name, a row does not need a label for the
   absence of one. */
export function CategoryPills({ cats }: { cats: string[] }) {
  if (!cats.length) return <span className="text-gray-400">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {cats.map((c) => {
        const t = CATEGORY_TONE[c] ?? '';
        const style = t === 'wp' ? { background: '#efeaf8', color: '#5b3aa6' }
          : t === 'cwp' ? { background: '#e0f4f4', color: '#0f6e74' }
            : t === 'wpl' ? { background: '#e8f0e2', color: '#40632c' }
              : t === 'cnc' ? { background: '#fbe6ea', color: '#8a2540' }
                : { background: '#fff4d6', color: '#7a5800' };
        return <span key={c} className="inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-bold" style={style}>{c}</span>;
      })}
    </span>
  );
}
