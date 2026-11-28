'use client';

import { forwardRef } from 'react';
import type { AmBmList, FollowupOutcome } from '@/lib/api/crm/am-checklist';
import { rupeesShort } from './format';

const OUTCOME_PARTS: Array<[FollowupOutcome, string, string]> = [
  ['manager_spoke', 'By manager', '#1B2332'],
  ['bm_spoke', 'By BM', '#5B7DB1'],
  ['whatsapp_only', 'WhatsApp only', '#E0A526'],
];
const STATUS_LABEL = { closed: 'Closed', wip: 'WIP', cancelled: 'Cancelled' } as const;
const STATUS_TONE = {
  closed: 'bg-[#E4F2E9] text-[#2F7D4F]',
  wip: 'bg-[#FFF3D1] text-[#8A5A00]',
  cancelled: 'bg-[#EEF1F4] text-[#667085]',
  none: 'bg-[#FBE7E4] text-[#B83A2B]',
} as const;

function Score({ value, of, label, pct }: { value: number | null; of?: number; label: string; pct?: boolean }) {
  const frac = pct ? (value ?? 0) / 100 : of ? (value ?? 0) / of : 0;
  const miss = pct ? value != null && value < 100 : of ? (value ?? 0) < of : false;
  return (
    <div className="px-4 border-l border-[#34405A] first:border-l-0">
      <b className="block text-[40px] font-extrabold leading-none text-[#F5C400]">
        {value ?? '–'}<small className="text-[22px] text-[#8F99A8] font-bold">{pct ? '%' : `/${of}`}</small>
      </b>
      <span className="block text-[13px] text-[#C9D0DA] mt-1.5">{label}</span>
      <i className="block h-1 rounded bg-[#34405A] mt-2 overflow-hidden">
        <u className="block h-full" style={{ width: `${Math.round(Math.min(1, frac) * 100)}%`, background: miss ? '#E0604F' : '#F5C400' }} />
      </i>
    </div>
  );
}

/** Rendered off-screen and captured to PNG for the WhatsApp group. */
export const DaySummary = forwardRef<HTMLDivElement, { list: AmBmList; branchName: string }>(function DaySummary({ list, branchName }, ref) {
  const bms = list.bms;
  const notPlaced = bms.flatMap((b) => b.summary.not_placed.map((c) => ({ ...c, bm: b.first_name })));
  const placed = bms.flatMap((b) => b.summary.placed);
  const reasons = notPlaced.filter((c) => c.reason.trim()).length;
  const priorities = bms.flatMap((b) => b.summary.priorities.filter((p) => p.text.trim()).map((p) => ({ ...p, bm: b.first_name })));
  const prMarked = priorities.filter((p) => p.status).length;
  const outcomes = bms.flatMap((b) => b.summary.followup_outcomes);
  const fuDone = outcomes.filter(Boolean).length;
  const fuPct = outcomes.length ? Math.round((fuDone / outcomes.length) * 100) : null;
  const scored = bms.filter((b) => b.progress.grooming_score != null);
  const fullGroom = scored.filter((b) => b.progress.grooming_score === 6).length;
  const lowGroom = scored.filter((b) => (b.progress.grooming_score ?? 0) < 6);
  const notGroomed = bms.filter((b) => b.progress.grooming_score == null);
  const prShow = [
    ...priorities.filter((p) => !p.status),
    ...priorities.filter((p) => p.status === 'wip'),
    ...priorities.filter((p) => p.status === 'closed' || p.status === 'cancelled'),
  ].slice(0, 6);
  const open = list.cutoff?.open ?? true;
  const notYet = <p className="text-[14px] text-[#667085] mt-1">Opens at {list.cutoff?.label ?? '1 PM'}.</p>;
  const dateLabel = new Date(`${list.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div ref={ref} className="w-[1120px] bg-white text-[#1B2332] rounded-[18px] overflow-hidden" style={{ fontVariantNumeric: 'tabular-nums' }}>
      <div className="bg-[#1B2332] text-white grid grid-cols-[1fr_auto] items-end gap-6 px-7 pt-5 pb-5">
        <div>
          <div className="text-[34px] font-extrabold leading-none tracking-tight">{branchName}</div>
          <div className="text-[15px] text-[#AEB6C2] mt-2">{dateLabel}, AM day summary · {list.done_count} of {list.total} BMs complete</div>
        </div>
        <div className="grid grid-cols-4 w-[512px]">
          <Score value={open ? reasons : null} of={notPlaced.length} label="Not-placed reasons" />
          <Score value={prMarked} of={priorities.length} label="Priorities marked" />
          <Score value={open ? fuPct : null} label="Follow-ups done" pct />
          <Score value={fullGroom} of={bms.length} label="Grooming at 6/6" />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_1fr]">
        <div className="px-7 py-5 border-r border-[#E2E6EB]">
          <h4 className="text-[15px] font-bold mb-2.5 flex justify-between">Checklist by BM <em className="not-italic font-medium text-[13px] text-[#667085]">{list.done_count} of {list.total} complete</em></h4>
          <div className="flex flex-wrap gap-1.5">
            {bms.map((b) => (
              <span key={b.id} className={`text-[13px] font-semibold rounded-2xl px-2.5 py-1 ${b.progress.done ? 'bg-[#E4F2E9] text-[#2F7D4F]' : b.progress.todo > 3 ? 'bg-[#FBE7E4] text-[#344054]' : 'bg-[#EEF1F4] text-[#344054]'}`}>
                {b.progress.done ? '✓ ' : ''}{b.first_name}{b.progress.done ? '' : <i className="not-italic text-[#B83A2B] ml-1.5 font-bold">{b.progress.todo}</i>}
              </span>
            ))}
          </div>
          <p className="text-[12.5px] text-[#667085] mt-1.5">Number = things still to do (reasons, priorities, follow-ups, grooming)</p>

          <h4 className="text-[15px] font-bold mt-6 mb-2.5 flex justify-between">Follow-ups due {open && <em className="not-italic font-medium text-[13px] text-[#667085]">{fuDone} of {outcomes.length} done</em>}</h4>
          {!open ? notYet : (<>
          <div className="flex h-3.5 rounded-md overflow-hidden bg-[#EEF1F4]">
            {outcomes.length > 0 && OUTCOME_PARTS.map(([k, , c]) => (
              <i key={k} className="block h-full" style={{ width: `${(outcomes.filter((o) => o === k).length / outcomes.length) * 100}%`, background: c }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 mt-2 text-[12.5px] text-[#344054]">
            {OUTCOME_PARTS.map(([k, l, c]) => (
              <span key={k} className="flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l} {outcomes.filter((o) => o === k).length}</span>
            ))}
            <span className="flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 rounded-sm bg-[#D5DAE1]" />Not done {outcomes.length - fuDone}</span>
          </div>
          </>)}

          <h4 className="text-[15px] font-bold mt-6 mb-1 flex justify-between">Grooming <em className="not-italic font-medium text-[13px] text-[#667085]">{fullGroom} of {bms.length} at 6/6</em></h4>
          {lowGroom.length > 0 && (
            <p className="text-[14px]">Below 6/6: {lowGroom.map((b, i) => <b key={b.id} className="text-[#B83A2B] font-semibold">{i ? ', ' : ''}{b.name} {b.progress.grooming_score}/6</b>)}</p>
          )}
          {notGroomed.length > 0 && <p className="text-[14px] text-[#667085]">Not scored: {notGroomed.map((b) => b.first_name).join(', ')}</p>}
          {lowGroom.length === 0 && notGroomed.length === 0 && <p className="text-[14px]">Everyone at 6/6.</p>}
        </div>

        <div className="px-7 py-5 bg-[#FAFBFC]">
          <h4 className="text-[15px] font-bold mb-1 flex justify-between">
            Yesterday&apos;s closures
            {open && <em className="not-italic font-medium text-[13px] text-[#667085]">
              {placed.length} of {placed.length + notPlaced.length} placed{placed.length ? `, ${rupeesShort(placed.reduce((a, c) => a + (c.placed_value ?? 0), 0))}` : ''}
            </em>}
          </h4>
          {!open && notYet}
          {open && notPlaced.slice(0, 5).map((c, i) => (
            <div key={i} className="border-l-[3px] border-[#B83A2B] pl-3 py-1 mt-2.5">
              <b className="text-[14.5px]">{c.client_name || 'Customer'} <em className="not-italic font-medium text-[#667085]">with {c.bm}, {rupeesShort(c.cart_value)}</em></b>
              <p className={`text-[13.5px] mt-0.5 ${c.reason.trim() ? 'text-[#344054]' : 'text-[#B83A2B] font-semibold'}`}>{c.reason.trim() || 'No reason written'}</p>
            </div>
          ))}
          {open && notPlaced.length === 0 && <p className="text-[14px] mt-1">Every expected closure was placed.</p>}
          {open && notPlaced.length > 5 && <p className="text-[14px] text-[#667085] mt-1">+ {notPlaced.length - 5} more not placed</p>}

          <h4 className="text-[15px] font-bold mt-6 mb-1 flex justify-between">Priorities <em className="not-italic font-medium text-[13px] text-[#667085]">{prMarked} of {priorities.length} marked</em></h4>
          {prShow.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2.5 items-center py-1.5 border-t first:border-t-0 border-[#E2E6EB] text-[14px]">
              <span><b className="font-semibold">{p.bm}:</b> {p.text}</span>
              <span className={`text-[12px] font-bold rounded-full px-2.5 py-0.5 ${STATUS_TONE[p.status ?? 'none']}`}>{p.status ? STATUS_LABEL[p.status] : 'Not marked'}</span>
            </div>
          ))}
          {priorities.length === 0 && <p className="text-[14px]">None written.</p>}
          {priorities.length > prShow.length && <p className="text-[14px] text-[#667085]">+ {priorities.length - prShow.length} more</p>}
        </div>
      </div>
      <div className="px-7 py-2.5 text-[12px] text-[#667085] border-t border-[#E2E6EB] flex justify-between">
        <span>MD AM checklist</span>
        <span>Generated {new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} IST</span>
      </div>
    </div>
  );
});
