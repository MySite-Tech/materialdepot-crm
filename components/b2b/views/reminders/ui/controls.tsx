'use client';

import { BUCKETS, Bucket } from '../constants';

export function BucketTabs({ active, counts, onPick }: {
  active: Bucket;
  counts: Record<Bucket, number>;
  onPick: (b: Bucket) => void;
}) {
  return (
    <div role="tablist" className="flex border-b border-gray-200 overflow-x-auto">
      {BUCKETS.map((b) => {
        const on = b.key === active;
        const n = counts[b.key];
        return (
          <button
            key={b.key}
            role="tab"
            aria-selected={on}
            title={b.rule}
            onClick={() => onPick(b.key)}
            className={`relative shrink-0 px-4 h-11 flex items-center gap-2 text-[14px] transition-colors ${on ? 'text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-800'}`}
          >
            {b.label}
            <span className={`min-w-[24px] h-5 px-1.5 rounded-full text-[12px] tabular-nums flex items-center justify-center ${n ? `${on ? 'bg-gray-900 text-white' : `bg-gray-100 ${b.tone}`}` : 'bg-gray-50 text-gray-400'}`}>
              {n}
            </span>
            {on && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gray-900" />}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<K extends string>({ value, options, onChange, label }: {
  value: K;
  options: { key: K; label: string; count: number; dot?: string }[];
  onChange: (k: K) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex p-0.5 rounded-lg bg-gray-100">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`h-8 px-3 rounded-md flex items-center gap-1.5 text-[13px] transition-colors ${on ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800'}`}
          >
            {o.dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: o.dot }} />}
            {o.label}
            <span className={`tabular-nums text-[12px] ${on ? 'text-gray-500' : 'text-gray-400'}`}>{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}
