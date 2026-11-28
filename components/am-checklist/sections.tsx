'use client';

import { useEffect, useState } from 'react';
import type {
  AmBmDay, AmClosure, AmFollowup, AmPriority, AmSavePayload, FollowupOutcome, PriorityStatus,
} from '@/lib/api/crm/am-checklist';
import { dayMonth, rupeesShort } from './format';

type Save = (payload: AmSavePayload) => Promise<void>;

const PRIORITY_STATES: Array<[PriorityStatus, string, string]> = [
  ['closed', 'Closed', 'bg-emerald-50 border-emerald-300 text-emerald-700'],
  ['wip', 'WIP', 'bg-amber-50 border-amber-300 text-amber-800'],
  ['cancelled', 'Cancelled', 'bg-gray-100 border-gray-300 text-gray-600'],
];
const MIN_PRIORITY_BOXES = 3;

export function Card({ title, tag, tagTone = 'gray', children }: {
  title: string;
  tag?: string;
  tagTone?: 'gray' | 'red' | 'green';
  children: React.ReactNode;
}) {
  const tones = {
    gray: 'bg-gray-100 text-gray-600',
    red: 'bg-red-50 text-red-700',
    green: 'bg-emerald-50 text-emerald-700',
  } as const;
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[17px] font-bold text-gray-900">{title}</h3>
        {tag && <span className={`text-[12px] font-bold px-2.5 py-0.5 rounded-full ${tones[tagTone]}`}>{tag}</span>}
      </div>
      {children}
    </section>
  );
}

function ratioTag(done: number, total: number): { tag: string; tone: 'gray' | 'red' | 'green' } {
  if (total === 0) return { tag: 'none', tone: 'gray' };
  return { tag: `${done}/${total}`, tone: done >= total ? 'green' : 'red' };
}

// ── Before the cutoff ────────────────────────────────────────────────────────

/** Stands in for Closures + Follow-ups until 1 PM IST, while the BM can still move dates. */
export function OpensAtCutoffCard({ label }: { label: string }) {
  return (
    <Card title="Closures & follow-ups" tag={`opens ${label}`}>
      <p className="text-[13.5px] text-gray-600">
        These open at {label}. Until then the BM can still change closure and follow-up dates.
        At {label} today&apos;s list is fixed and won&apos;t change after that.
      </p>
    </Card>
  );
}

// ── 1. Closures ──────────────────────────────────────────────────────────────

export function ClosuresCard({ day, locked, save, onReasonSaved }: {
  day: AmBmDay;
  locked: boolean;
  save: Save;
  onReasonSaved: (closure: AmClosure, reason: string) => void;
}) {
  const { yesterday, today, yesterday_date } = day.closures;
  const notPlaced = yesterday.filter((c) => !c.placed);
  const withReason = notPlaced.filter((c) => c.reason.trim()).length;
  const { tag, tone } = ratioTag(withReason, notPlaced.length);

  return (
    <Card title="Closures" tag={tag} tagTone={tone}>
      <p className="text-[13px] font-semibold text-gray-600">Expected yesterday, {dayMonth(yesterday_date)}</p>
      {yesterday.length === 0 ? (
        <p className="text-[13.5px] text-gray-500 mt-1 mb-3">None expected.</p>
      ) : (
        <div className="mt-2 mb-3 flex flex-col gap-2">
          {yesterday.map((c) => (
            <ClosureRow key={c.ticket_id} closure={c} locked={locked} save={save} onReasonSaved={onReasonSaved} />
          ))}
        </div>
      )}
      <p className="text-[13px] font-semibold text-gray-600">Expected today</p>
      {today === null ? (
        <p className="text-[13.5px] text-gray-400 mt-1">Not tracked for past days.</p>
      ) : today.length === 0 ? (
        <p className="text-[13.5px] text-gray-500 mt-1">None expected.</p>
      ) : (
        <ul className="mt-1 text-[13.5px] text-gray-700">
          {today.map((t) => (
            <li key={t.ticket_id} className="flex justify-between py-0.5">
              <span>{t.client_name || 'Customer'} <span className="text-gray-400">· {t.contact}</span></span>
              <span className="font-semibold">{rupeesShort(t.cart_value)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[12px] text-gray-400 mt-3">
        From the closure date on each CRM lead, checked against orders placed yesterday or today.
      </p>
    </Card>
  );
}

function ClosureRow({ closure, locked, save, onReasonSaved }: {
  closure: AmClosure;
  locked: boolean;
  save: Save;
  onReasonSaved: (closure: AmClosure, reason: string) => void;
}) {
  const [reason, setReason] = useState(closure.reason);
  useEffect(() => setReason(closure.reason), [closure.reason, closure.ticket_id]);

  const commit = async () => {
    const next = reason.trim();
    if (next === closure.reason.trim()) return;
    await save({ closures: [{ ticket_id: closure.ticket_id, reason: next }] });
    if (next) onReasonSaved(closure, next);
  };

  return (
    <div className="border border-gray-100 rounded-xl p-3">
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <b className="block text-[14px] truncate">{closure.client_name || 'Customer'}</b>
          <span className="text-[12px] text-gray-500">
            {closure.contact} · expected {rupeesShort(closure.cart_value)}
            {closure.placed && closure.placed_value != null ? ` · ordered ${rupeesShort(closure.placed_value)}` : ''}
          </span>
        </div>
        <span className={`self-start text-[12px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${closure.placed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {closure.placed ? '✓ Placed' : '✗ Not placed'}
        </span>
      </div>
      {!closure.placed && (
        <input
          className={`mt-2 w-full px-3 py-2 text-[13px] rounded-lg border outline-none ${reason.trim() ? 'border-gray-200' : 'border-red-300 bg-red-50/40'} disabled:bg-gray-50`}
          placeholder="Why not placed, and what's next? (goes on the lead)"
          value={reason}
          disabled={locked}
          onChange={(e) => setReason(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
      )}
    </div>
  );
}

// ── 2. Priorities ────────────────────────────────────────────────────────────

export function PrioritiesCard({ day, locked, save, bmFirstName }: {
  day: AmBmDay;
  locked: boolean;
  save: Save;
  bmFirstName: string;
}) {
  const [rows, setRows] = useState<AmPriority[]>(() => padPriorities(day.priorities));
  useEffect(() => setRows(padPriorities(day.priorities)), [day.priorities, day.bm.id, day.date]);

  const written = rows.filter((p) => p.text.trim());
  const marked = written.filter((p) => p.status).length;
  const { tag, tone } = ratioTag(marked, written.length);

  const persist = (next: AmPriority[]) =>
    save({ priorities: next.filter((p) => p.text.trim()).map((p) => ({ ...p, text: p.text.trim() })) });

  const setText = (i: number, text: string) => setRows((prev) => prev.map((p, j) => (j === i ? { ...p, text } : p)));

  // Saves only when the written text changed (carried WIP counts as unsaved until the first save).
  const commitText = () => {
    const before = day.priorities.filter((p) => p.text.trim());
    const after = rows.filter((p) => p.text.trim());
    const same = before.length === after.length && before.every((p, j) => p.text.trim() === after[j].text.trim());
    if (!same) persist(rows);
  };

  const toggleStatus = (i: number, status: PriorityStatus) => {
    if (!rows[i].text.trim()) return;
    const next = rows.map((p, j) => (j === i ? { ...p, status: p.status === status ? null : status } : p));
    setRows(next);
    persist(next);
  };

  return (
    <Card title="Priorities" tag={tag} tagTone={tone}>
      <div className="flex flex-col gap-3">
        {rows.map((p, i) => (
          <div key={i}>
            {p.from && <div className="text-[11.5px] font-semibold text-amber-700 mb-1">↻ WIP from {dayMonth(p.from)}</div>}
            <textarea
              rows={2}
              className="w-full px-3 py-2.5 text-[14px] rounded-lg border border-gray-200 outline-none resize-y disabled:bg-gray-50"
              placeholder={i === 0 ? `Priority 1 for ${bmFirstName} today...` : `Priority ${i + 1}...`}
              value={p.text}
              disabled={locked}
              onChange={(e) => setText(i, e.target.value)}
              onBlur={commitText}
            />
            {p.text.trim() && (
              <div className="flex gap-2 mt-1.5">
                {PRIORITY_STATES.map(([key, label, on]) => (
                  <button
                    key={key}
                    type="button"
                    disabled={locked}
                    onClick={() => toggleStatus(i, key)}
                    className={`px-3 py-1 rounded-full border text-[12px] font-semibold cursor-pointer disabled:cursor-default ${p.status === key ? on : 'bg-white border-gray-200 text-gray-500'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {!locked && (
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, { text: '', status: null, from: null }])}
            className="w-full py-2.5 rounded-lg border border-dashed border-gray-300 text-[14px] text-gray-700 bg-white cursor-pointer hover:border-gray-400"
          >
            + Add another priority
          </button>
        )}
      </div>
      <p className="text-[12px] text-gray-400 mt-3">Write in the morning, mark each by the end of the day. WIP carries to tomorrow.</p>
    </Card>
  );
}

function padPriorities(list: AmPriority[]): AmPriority[] {
  const rows = list.map((p) => ({ text: p.text, status: p.status ?? null, from: p.from ?? null }));
  while (rows.length < MIN_PRIORITY_BOXES) rows.push({ text: '', status: null, from: null });
  return rows;
}

// ── 3. Follow-ups ────────────────────────────────────────────────────────────

export function FollowupsCard({ day, locked, save }: { day: AmBmDay; locked: boolean; save: Save }) {
  const done = day.followups.filter((f) => f.outcome).length;
  const { tag, tone } = ratioTag(done, day.followups.length);
  const outcomes = day.questions.followup_outcomes;

  const setOutcome = (f: AmFollowup, outcome: FollowupOutcome) =>
    save({ followups: [{ ticket_id: f.ticket_id, outcome: f.outcome === outcome ? null : outcome }] });

  return (
    <Card title="Follow-ups due" tag={tag} tagTone={tone}>
      {day.followups.length === 0 ? (
        <p className="text-[13.5px] text-gray-500">No follow-ups overdue or due today.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {day.followups.map((f) => (
            <div key={f.ticket_id} className="border border-gray-100 rounded-xl p-3">
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <b className="block text-[15px] truncate">{f.client_name || 'Customer'}</b>
                  <span className="text-[12.5px] text-gray-500">
                    📞 <b className="text-gray-700">{f.contact}</b>
                    {f.cart_number ? ' · in cart' : ''}
                    {f.bucket === 'overdue' && f.followup_date ? (
                      <span className="text-red-600 font-semibold"> · overdue since {dayMonth(f.followup_date)}</span>
                    ) : null}
                  </span>
                </div>
                <b className="text-[15px] whitespace-nowrap">{rupeesShort(f.cart_value)}</b>
              </div>
              {f.latest_remark && (
                <p className="mt-2 text-[12.5px] text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                  {dayMonth(f.latest_remark.created_at)}: {f.latest_remark.text}
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 mt-2">
                {outcomes.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    disabled={locked}
                    onClick={() => setOutcome(f, o.id)}
                    className={`py-2 rounded-lg border text-[13px] font-medium cursor-pointer disabled:cursor-default ${f.outcome === o.id ? 'bg-[#1B2332] border-[#1B2332] text-white' : 'bg-white border-gray-200 text-gray-800'}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── 4. Grooming ──────────────────────────────────────────────────────────────

export function GroomingCard({ day, locked, save }: { day: AmBmDay; locked: boolean; save: Save }) {
  const items = day.questions.grooming;
  const current = day.grooming?.items ?? {};
  const scored = day.grooming?.score != null;

  const saveItems = (next: Record<string, boolean | null>) =>
    save({ grooming: { items: Object.fromEntries(items.map((i) => [i.id, !!next[i.id]])) } });

  const toggle = (id: string) => saveItems({ ...current, [id]: !current[id] });
  const allSix = () => saveItems(Object.fromEntries(items.map((i) => [i.id, true])));

  return (
    <Card title="Grooming" tag={scored ? `${day.grooming!.score}/${day.grooming!.out_of}` : 'to score'} tagTone={scored ? (day.grooming!.score === day.grooming!.out_of ? 'green' : 'red') : 'red'}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {items.map((i) => (
          <label
            key={i.id}
            className={`flex items-center gap-3 px-3 py-3 rounded-xl border text-[14.5px] ${locked ? '' : 'cursor-pointer'} ${current[i.id] ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200'}`}
          >
            <input
              type="checkbox"
              className="w-5 h-5 accent-emerald-600"
              checked={!!current[i.id]}
              disabled={locked}
              onChange={() => toggle(i.id)}
            />
            {i.label}
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className={`text-[17px] font-bold ${scored ? 'text-gray-800' : 'text-gray-400'}`}>
          {scored ? `Scored ${day.grooming!.score}/${day.grooming!.out_of}` : 'Not scored'}
        </span>
        {!locked && (
          <button type="button" onClick={allSix} className="px-4 py-2 rounded-lg bg-[#F5C400] text-[#1B2332] font-bold text-[14px] cursor-pointer border-none">
            All {items.length} ✓
          </button>
        )}
      </div>
    </Card>
  );
}
