'use client';

import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-200 p-5 ${className}`}>{children}</div>;
}

export function SectionHead({ title, hint, right }: { title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <div className="flex items-center gap-1.5">
        <h2 className="text-[13px] font-bold text-gray-800">{title}</h2>
        {hint && <Hint text={hint} />}
      </div>
      {right}
    </div>
  );
}

export function Hint({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 text-[9px] font-bold text-gray-400 cursor-help select-none"
    >
      i
    </span>
  );
}

export function Segmented<K extends string>({ options, value, onChange }: {
  options: Record<K, string>;
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
      {(Object.keys(options) as K[]).map((k) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md cursor-pointer transition-colors ${
            value === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {options[k]}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="tabular-nums text-lg font-bold mt-0.5 truncate" style={{ color: tone || '#111827' }}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export function Pill({ children, tone }: { children: ReactNode; tone: 'good' | 'warn' | 'bad' | 'muted' }) {
  const cls = {
    good: 'bg-green-50 text-green-700',
    warn: 'bg-amber-50 text-amber-700',
    bad: 'bg-red-50 text-red-600',
    muted: 'bg-gray-100 text-gray-500',
  }[tone];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${cls}`}>{children}</span>;
}

export function LinkButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  if (!onClick) return null;
  return (
    <button onClick={onClick} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer whitespace-nowrap">
      {children} →
    </button>
  );
}

export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
      <span className="font-semibold">{title}</span>{' '}{children}
    </div>
  );
}

export function StackBar({ parts, height = 'h-2' }: { parts: { key: string; value: number; color: string; label?: string }[]; height?: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className={`flex ${height} rounded-full overflow-hidden bg-gray-100 gap-[2px]`}>
      {total > 0 && parts.filter((p) => p.value > 0).map((p) => (
        <div
          key={p.key}
          title={`${p.label ?? p.key}: ${p.value}`}
          className="h-full transition-[width] duration-500"
          style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
        />
      ))}
    </div>
  );
}
