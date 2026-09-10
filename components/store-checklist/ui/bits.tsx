'use client';

import type { DayProgress } from '@/lib/store-checklist/types';
import type { SaveState } from '../hooks/use-checklist-day';

export function Notice({ tone, children }: { tone: 'amber' | 'red' | 'gray'; children: React.ReactNode }) {
  const tones = {
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    red: 'bg-red-50 border-red-200 text-red-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-600',
  } as const;
  return (
    <div className={`border rounded-md px-3 py-2 text-[12.5px] leading-relaxed ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function ProgressBar({ progress }: { progress: DayProgress }) {
  const pct = progress.total === 0 ? 0 : Math.round((progress.answered / progress.total) * 100);
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <div className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${progress.complete ? 'bg-emerald-500' : 'bg-[#EAB308]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11.5px] font-semibold text-gray-500 tabular-nums whitespace-nowrap">
        {progress.answered}/{progress.total}
      </span>
    </div>
  );
}

export function StatCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'plain' | 'good' | 'warn' | 'bad' }) {
  const valueTone = {
    plain: 'text-gray-800',
    good: 'text-emerald-600',
    warn: 'text-amber-600',
    bad: 'text-red-600',
  }[tone ?? 'plain'];
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3.5 py-3">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      <span className={`block mt-1 text-[20px] font-bold tabular-nums ${valueTone}`}>{value}</span>
      {hint && <span className="block mt-0.5 text-[11px] text-gray-400">{hint}</span>}
    </div>
  );
}

const timeLabel = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });

export function SavePill({ state, unsavedCount, onRetry }: { state: SaveState; unsavedCount: number; onRetry: () => void }) {
  if (state.status === 'error') {
    return (
      <div className="flex items-center gap-2 text-[12px] font-semibold text-red-600">
        <span>Not saved — {state.message}</span>
        <button
          type="button"
          onClick={onRetry}
          className="px-2 py-1 rounded border border-red-200 bg-white text-red-600 cursor-pointer hover:bg-red-50"
        >
          Retry
        </button>
      </div>
    );
  }
  if (state.status === 'saving' || unsavedCount > 0) {
    return <span className="text-[12px] font-semibold text-amber-600">Saving{unsavedCount > 0 ? ` ${unsavedCount}` : ''}…</span>;
  }
  if (state.status === 'saved') {
    return <span className="text-[12px] font-semibold text-emerald-600">Saved at {timeLabel(state.at)}</span>;
  }
  return null;
}

export function markedByLine(updatedBy: string | null, updatedAt: string | null): string {
  if (!updatedBy && !updatedAt) return 'Not marked yet';
  const who = updatedBy || 'unknown';
  return updatedAt ? `Last mark by ${who} at ${timeLabel(updatedAt)}` : `Last mark by ${who}`;
}
