'use client';

import { fmtDateA } from '@/components/site-audit/shared';
import { cn } from '@/lib/utils';
import { useMemo, useState } from 'react';

import { Order } from '../../types/auditor';
import { DayStrip, StatusChip } from '../ui';
import { computeDisplayStatus, dstr, mapUrl, slotLabel, todayMidnight } from '../utils';

function JobListCard({
  order,
  displayStatus,
  unscheduled,
  onOpen,
}: {
  order: Order;
  displayStatus: string;
  unscheduled?: boolean;
  onOpen: () => void;
}) {
  const skus = order.skus.filter((s) => !s.audit);
  return (
    <div
      onClick={onOpen}
      className={cn(
        'mb-3 cursor-pointer rounded-lg border bg-white p-4 hover:border-gray-300',
        unscheduled ? 'border-yellow-400' : 'border-gray-200',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold text-gray-900">{order.name}</div>
          <div className="text-[13px] text-gray-500">{order.pi} · BM {order.bm}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className={cn('mb-1 text-[13px] font-semibold', unscheduled ? 'text-yellow-700' : 'text-gray-700')}>
            {unscheduled ? 'Awaiting date from office' : slotLabel(order.slot)}
          </div>
          <StatusChip status={displayStatus} />
        </div>
      </div>
      <div className="mt-3 space-y-1.5 text-[13px] text-gray-600">
        <div className="flex items-center gap-2">
          <span>📱</span>
          {order.phone}
        </div>
        <div className="flex items-center gap-2">
          <span>📍</span>
          <a
            href={mapUrl(order.addr)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-600 hover:underline"
          >
            {order.addr}
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span>📦</span>
          {skus.length ? (
            skus.map((s, i) => (
              <span key={i} className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                {s.c}
              </span>
            ))
          ) : (
            <span>NA</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function JobListView({
  orders,
  selDay,
  onSelectDay,
  today,
  onOpenJob,
}: {
  orders: Order[];
  selDay: string;
  onSelectDay: (d: string) => void;
  today: Date;
  onOpenJob: (pi: string) => void;
}) {
  const now = new Date();
  const todayStr = dstr(today);
  const withDisplay = useMemo(
    () => orders.map((o) => ({ o, displayStatus: computeDisplayStatus(o, now, today) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, today],
  );
  const list = withDisplay
    .filter(({ o }) => o.date === selDay)
    .sort((a, b) => (a.o.slot || '').localeCompare(b.o.slot || ''));
  const todo = list.filter(({ displayStatus }) => displayStatus !== 'completed');
  const done = list.filter(({ displayStatus }) => displayStatus === 'completed');
  const unscheduled = withDisplay.filter(
    ({ o, displayStatus }) => !o.date && !['completed', 'reschedule'].includes(displayStatus),
  );

  return (
    <div>
      <DayStrip orders={orders} selDay={selDay} onSelectDay={onSelectDay} today={today} />
      {unscheduled.length > 0 && (
        <>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-yellow-700">
            Awaiting schedule — no date set yet
          </div>
          {unscheduled.map(({ o, displayStatus }) => (
            <JobListCard key={o.pi} order={o} displayStatus={displayStatus} unscheduled onOpen={() => onOpenJob(o.pi)} />
          ))}
        </>
      )}
      <div className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-gray-700">
        {selDay === todayStr ? 'Today' : 'Jobs'} — {fmtDateA(selDay)}
      </div>
      {todo.length ? (
        todo.map(({ o, displayStatus }) => (
          <JobListCard key={o.pi} order={o} displayStatus={displayStatus} onOpen={() => onOpenJob(o.pi)} />
        ))
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          No pending audits for this day.
        </div>
      )}
      {done.length > 0 && (
        <>
          <div className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-gray-700">Completed</div>
          {done.map(({ o, displayStatus }) => (
            <JobListCard key={o.pi} order={o} displayStatus={displayStatus} onOpen={() => onOpenJob(o.pi)} />
          ))}
        </>
      )}
    </div>
  );
}

export function RescheduleForm({
  showToast,
  busy,
  onCancel,
  onConfirm,
}: {
  showToast: (m: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string, followUp: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [followUp, setFollowUp] = useState('');
  const todayStr = dstr(todayMidnight());
  return (
    <div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2.5 text-[15px] font-bold text-red-600">Reschedule audit</h2>
        <p className="mb-3.5 text-[13.5px] text-gray-500">
          Explain why this visit can&apos;t proceed. The SM will rebook the slot.
        </p>
        <label className="text-[13px] font-bold text-gray-700">
          Reason <span className="text-red-600">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Customer not available, site not accessible, material not matching…"
          className="mt-1.5 block min-h-[100px] w-full resize-y rounded-lg border border-gray-200 p-2.5 text-[13.5px] outline-none focus:border-yellow-400"
        />
        <label className="mt-3.5 block text-[13px] font-bold text-gray-700">
          Follow-up date <span className="text-[11px] font-normal text-gray-400">(optional — when to call client)</span>
        </label>
        <input
          type="date"
          min={todayStr}
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          className="mt-1.5 block w-full rounded-lg border border-gray-200 p-2.5 text-[13.5px] outline-none focus:border-yellow-400"
        />
      </div>
      <div className="mt-3.5 flex gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!reason.trim()) {
              showToast('Please enter a reason for rescheduling');
              return;
            }
            onConfirm(reason.trim(), followUp.trim());
          }}
          className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Submitting…' : 'Confirm Reschedule'}
        </button>
      </div>
    </div>
  );
}
