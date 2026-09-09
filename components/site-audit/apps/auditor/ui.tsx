'use client';

import { STATUS_LABELS } from '../../constants/auditor';
import { Order } from '../../types/auditor';
import { addDays, dstr } from '../../utils/auditor';
import { cn } from '@/lib/utils/index';
import { useEffect, useMemo, useRef, useState } from 'react';

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" />
    </div>
  );
}

export function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex py-0.5 text-[13px]">
      <span className="w-28 shrink-0 text-gray-400">{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  );
}

export function StatusChip({ status }: { status: string }) {
  const s = STATUS_LABELS[status] || { l: status, chip: 'bg-gray-100 text-gray-600' };
  return (
    <span className={cn('inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', s.chip)}>
      {s.l}
    </span>
  );
}

export function FieldRO({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="text-xs text-gray-500">{label}</label>
      <input
        value={value}
        disabled
        className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-500"
      />
    </div>
  );
}

export function CommentDialog({
  title,
  onCancel,
  onConfirm,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: (comment: string) => void;
}) {
  const [comment, setComment] = useState('');
  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/40 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-lg rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="mb-3 text-[15px] font-bold text-gray-900">{title}</div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment (optional — leave blank to skip)"
          className="mb-3 min-h-[80px] w-full resize-y rounded-lg border border-gray-200 p-2.5 text-sm outline-none focus:border-yellow-400"
        />
        <div className="grid grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-200 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(comment.trim())}
            className="col-span-2 rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white hover:opacity-90"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export function DayStrip({
  orders,
  selDay,
  onSelectDay,
  today,
}: {
  orders: Order[];
  selDay: string;
  onSelectDay: (d: string) => void;
  today: Date;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const days = useMemo(() => Array.from({ length: 37 }, (_, i) => addDays(today, i - 30)), [today]);
  const todayStr = dstr(today);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const sel = strip.querySelector<HTMLElement>('[data-selected="true"]');
    if (sel) strip.scrollLeft = Math.max(0, sel.offsetLeft - strip.clientWidth / 2 + sel.offsetWidth / 2);
  }, [selDay]);

  return (
    <div ref={stripRef} className="mb-4 flex gap-2 overflow-x-auto pb-2">
      {days.map((d) => {
        const ds = dstr(d);
        const n = orders.filter((o) => o.date === ds).length;
        const isToday = ds === todayStr;
        const isSel = ds === selDay;
        return (
          <button
            key={ds}
            type="button"
            data-selected={isSel}
            onClick={() => onSelectDay(ds)}
            className={cn(
              'flex w-16 shrink-0 flex-col items-center rounded-lg border px-2 py-2 text-center',
              isSel ? 'border-[#EAB308] bg-yellow-50' : 'border-gray-200 bg-white',
            )}
          >
            <div className="text-[11px] font-semibold text-gray-500">
              {isToday ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' })}
            </div>
            <div className="text-lg font-bold text-gray-900">{d.getDate()}</div>
            <div className="h-3 text-[10px] text-gray-400">{n > 0 ? `${n} audit${n !== 1 ? 's' : ''}` : ''}</div>
          </button>
        );
      })}
    </div>
  );
}
