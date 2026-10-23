'use client';

import type { KeyboardEvent, ReactNode } from 'react';

import { BNAME, BUCKET_COLORS, PAGE_SIZE, PNAME, SCORE_COLORS } from '../constants';
import { fmt, pctText } from '../utils/format';

export const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-amber-500';
export const KPI_GRID = 'grid grid-cols-1 min-[360px]:grid-cols-2 gap-3';
export const NOTE = 'text-[12px] text-gray-500';

export function activate(fn: () => void) {
  return {
    onClick: fn,
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } },
  };
}

export function Seg<T extends string>({ value, options, onChange }: {
  value: T;
  options: Array<[T, string, string?]>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto border border-gray-200 rounded-lg">
      {options.map(([v, label, title]) => (
        <button key={v} title={title} aria-pressed={value === v} onClick={() => onChange(v)}
          className={`px-3 py-1.5 text-[12px] whitespace-nowrap cursor-pointer ${FOCUS} ${value === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function StackBar({ parts, n, colors, tip }: { parts: number[]; n: number; colors: readonly string[]; tip: (i: number, x: number) => string }) {
  return (
    <div className="flex h-3.5 rounded overflow-hidden min-w-[160px] bg-gray-100">
      {n > 0 && parts.map((x, i) => x ? (
        <i key={i} className="block h-full" style={{ width: `${(x * 100) / n}%`, background: colors[i] }} title={tip(i, x)} />
      ) : null)}
    </div>
  );
}

export function ScoreBar({ d, n }: { d: number[]; n: number }) {
  return <StackBar parts={d} n={n} colors={SCORE_COLORS} tip={(i, x) => `${i} of 4: ${fmt(x)} leads (${pctText(x, n)})`} />;
}

export function BucketBar({ b, n }: { b: number[]; n: number }) {
  return <StackBar parts={b} n={n} colors={BUCKET_COLORS} tip={(i, x) => `${BNAME[i]}: ${fmt(x)} (${pctText(x, n)})`} />;
}

export function Legend({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
      {items.map(([color, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color }} />{label}
        </span>
      ))}
    </div>
  );
}

export function PointerChips({ p }: { p: number }) {
  return (
    <>
      {PNAME.map((x, i) => (
        <span key={x} className={`inline-block text-[10px] font-bold rounded px-1.5 ${(p >> i) & 1 ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-300 line-through'}`}>
          {i === 3 ? 'Next' : x}
        </span>
      ))}
    </>
  );
}

export function Kpi({ label, value, sub, color, accent, onClick, title, children }: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
  accent?: string;
  onClick?: () => void;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div {...(onClick ? { ...activate(onClick), role: 'button' } : {})} title={title}
      className={`bg-white border border-gray-200 rounded-xl px-4 py-3 min-w-0 ${onClick ? `cursor-pointer hover:border-gray-300 hover:shadow-md transition-shadow ${FOCUS}` : ''}`}
      style={accent ? { borderTop: `4px solid ${accent}` } : undefined}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-[26px] font-bold mt-1 leading-tight tabular-nums" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="text-[12px] text-gray-500">{sub}</div>}
      {children}
    </div>
  );
}

export function Panel({ title, hint, right, children }: { title: string; hint?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 pt-3.5 pb-2.5">
        <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
        {hint && <span className="text-[12px] text-gray-500">{hint}</span>}
        {right && <div className="ml-auto flex flex-wrap gap-2">{right}</div>}
      </div>
      {children}
    </section>
  );
}

export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="overflow-auto max-h-[620px] overscroll-x-contain">{children}</div>;
}

const TH = 'sticky top-0 z-[1] bg-gray-50 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap border-b border-gray-200';

export function Th({ label, left, title }: { label: string; left?: boolean; title?: string }) {
  return <th scope="col" title={title} className={`${TH} text-gray-400 ${left ? 'text-left' : 'text-right'}`}>{label}</th>;
}

export function SortTh<K extends string>({ k, label, sort, onSort, left, title }: {
  k: K;
  label: string;
  sort: { k: K; dir: 1 | -1 };
  onSort: (k: K) => void;
  left?: boolean;
  title?: string;
}) {
  const on = sort.k === k;
  return (
    <th scope="col" title={title} aria-sort={on ? (sort.dir < 0 ? 'descending' : 'ascending') : 'none'}
      className={`${TH} ${left ? 'text-left' : 'text-right'} ${on ? 'text-gray-900' : 'text-gray-400'}`}>
      <button onClick={() => onSort(k)} className={`uppercase tracking-wide cursor-pointer hover:text-gray-900 ${FOCUS}`}>
        {label}{on ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  );
}

export const ROW = `cursor-pointer hover:bg-amber-50 focus-visible:bg-amber-50 ${FOCUS}`;

export function Pager({ page, total, onPage, size = PAGE_SIZE }: { page: number; total: number; onPage: (p: number) => void; size?: number }) {
  if (total <= size) return null;
  const pages = Math.ceil(total / size);
  const btn = `px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer disabled:opacity-40 disabled:cursor-default ${FOCUS}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 text-[12px] text-gray-500">
      <span className="tabular-nums">Showing {fmt((page - 1) * size + 1)}–{fmt(Math.min(page * size, total))} of {fmt(total)}</span>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className={btn}>← Prev</button>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className={btn}>Next →</button>
      </div>
    </div>
  );
}

export function Spinner({ big }: { big?: boolean }) {
  return <span aria-hidden className={`inline-block ${big ? 'w-5 h-5' : 'w-3 h-3'} border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin`} />;
}

export function ErrorBanner({ children, onRetry, busy }: { children: ReactNode; onRetry?: () => void; busy?: boolean }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
      <span className="min-w-0 break-words">{children}</span>
      {onRetry && (
        <button onClick={onRetry} disabled={busy}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-red-800 hover:bg-red-100 cursor-pointer disabled:opacity-60 disabled:cursor-default ${FOCUS}`}>
          {busy && <Spinner />}{busy ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title = 'No remarks match these filters', sub, onReset }: { title?: string; sub?: ReactNode; onReset?: () => void }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-6 py-14 text-center">
      <div className="text-[15px] font-semibold text-gray-800">{title}</div>
      <p className="mt-1.5 text-[13px] text-gray-500">{sub ?? 'Try a wider date range or fewer filters.'}</p>
      {onReset && (
        <button onClick={onReset}
          className={`mt-4 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 cursor-pointer ${FOCUS}`}>
          Reset filters
        </button>
      )}
    </div>
  );
}

const Bone = ({ className }: { className: string }) => <div className={`rounded-lg bg-gray-100 animate-pulse ${className}`} />;

export function LoadingSkeleton({ note }: { note: string }) {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-500"><Spinner />{note}</div>
      <div className="flex flex-wrap gap-2">{['w-28', 'w-20', 'w-16', 'w-24', 'w-28', 'w-20'].map((w, i) => <Bone key={i} className={`h-8 ${w}`} />)}</div>
      <div className={`${KPI_GRID} md:grid-cols-4 xl:grid-cols-7`}>
        {[...Array(7)].map((_, i) => <Bone key={i} className="h-[92px] rounded-xl" />)}
      </div>
      {[0, 1].map(i => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2.5">
          <Bone className="h-4 w-48" />
          {[...Array(5)].map((_, j) => <Bone key={j} className="h-6 w-full" />)}
        </div>
      ))}
    </div>
  );
}
