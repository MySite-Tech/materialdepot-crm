'use client';

import { categoryFor } from '@/components/site-audit/data/auditRegistry';
import { fmtDateA } from '@/components/site-audit/siteAuditShared';

import { Job } from '../../types/installer';
import { StatusPill } from './ui';
import { dstr, slotsLabel } from '../../utils/installer';

export function JobListScreen({
  days, selDay, todayStr, onSelectDay, dayStripRef, jobs, overdue, unscheduled, todo, done, slots, onOpen,
}: {
  days: Date[];
  selDay: string;
  todayStr: string;
  onSelectDay: (ds: string) => void;
  dayStripRef: React.RefObject<HTMLDivElement | null>;
  jobs: Job[];
  overdue: Job[];
  unscheduled: Job[];
  todo: Job[];
  done: Job[];
  slots: Record<string, { label: string; start: number }>;
  onOpen: (key: string) => void;
}) {
  return (
    <div>
      {(overdue.length > 0 || unscheduled.length > 0) && (
        <div className="mb-4 flex flex-col gap-2">
          {overdue.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-red-600">Overdue — action needed</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {overdue.map((j) => <JobCardTile key={j.pi + '|' + j.sjId} job={j} slots={slots} variant="overdue" onClick={() => onOpen(j.pi + '|' + j.sjId)} />)}
              </div>
            </div>
          )}
          {unscheduled.length > 0 && (
            <div className="mt-1">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-600">Unscheduled — awaiting date from office</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {unscheduled.map((j) => <JobCardTile key={j.pi + '|' + j.sjId} job={j} slots={slots} variant="unscheduled" onClick={() => onOpen(j.pi + '|' + j.sjId)} />)}
              </div>
            </div>
          )}
        </div>
      )}

      <div ref={dayStripRef} className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => {
          const ds = dstr(d);
          const n = jobs.filter((j) => j.date === ds).length;
          const isToday = ds === todayStr;
          const selected = ds === selDay;
          return (
            <div
              key={ds}
              data-selected={selected ? 'true' : undefined}
              onClick={() => onSelectDay(ds)}
              className={`flex h-16 w-16 shrink-0 cursor-pointer select-none flex-col items-center justify-center rounded-lg border ${selected ? 'border-[#EAB308] bg-yellow-50 text-gray-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide">{isToday ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
              <div className="text-sm font-bold">{d.getDate()}</div>
              <div className="text-[10px] text-gray-400">{n > 0 ? n + (n !== 1 ? ' jobs' : ' job') : ''}</div>
            </div>
          );
        })}
      </div>

      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-700">{selDay === todayStr ? 'Today' : 'Jobs'} — {fmtDateA(selDay)}</div>
      {todo.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-[13px] text-gray-400">No jobs for this day.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {todo.map((j) => <JobCardTile key={j.pi + '|' + j.sjId} job={j} slots={slots} variant="normal" onClick={() => onOpen(j.pi + '|' + j.sjId)} />)}
        </div>
      )}

      {done.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-700">Finished</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {done.map((j) => <JobCardTile key={j.pi + '|' + j.sjId} job={j} slots={slots} variant="normal" onClick={() => onOpen(j.pi + '|' + j.sjId)} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function JobCardTile({ job, slots, variant, onClick }: { job: Job; slots: Record<string, { label: string; start: number }>; variant: 'normal' | 'unscheduled' | 'overdue'; onClick: () => void }) {
  const borderClass = variant === 'overdue' ? 'border-red-300' : variant === 'unscheduled' ? 'border-amber-300' : 'border-gray-200';
  const timeText = variant === 'overdue' ? 'Overdue — ' + fmtDateA(job.date) : variant === 'unscheduled' ? 'No date set — tap to open' : slotsLabel(job, slots);
  const timeClass = variant === 'overdue' ? 'text-red-600' : variant === 'unscheduled' ? 'text-amber-600' : 'text-gray-500';
  return (
    <div onClick={onClick} className={`cursor-pointer rounded-lg border bg-white p-4 hover:bg-gray-50 ${borderClass}`}>
      <div className={`text-[12px] font-semibold ${timeClass}`}>{timeText}</div>
      <div className="mt-1 text-sm font-bold text-black">{job.name}</div>
      <div className="text-[12px] text-gray-500">{job.addr}</div>
      <div className="mt-2 flex items-center justify-between">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${job.type === 'wallpaper' ? 'bg-purple-100 text-purple-700' : job.type === 'wallpanel' ? 'bg-teal-100 text-teal-700' : 'bg-yellow-100 text-yellow-800'}`}>
          {categoryFor(job.type).pdfLabel}
        </span>
        <StatusPill status={job.status} />
      </div>
    </div>
  );
}
