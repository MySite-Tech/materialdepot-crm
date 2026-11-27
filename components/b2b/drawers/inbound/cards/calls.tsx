'use client';

import { LOST_STALLED, LOST_UNREACHABLE, MIN_ATTEMPTS_BEFORE_CLOSE, READY_RNR_COUNT, READY_WINDOW_DAYS } from '../../../constants/inbound';
import { callTally } from '../../../models/inbound';
import { InboundLead, LeadNote } from '../../../models/mock-data';
import { CallAttempt, ClosureReadiness } from '../../../types/inbound';
import { Empty, Field, GateErrors, errorInputCls, fmtLeadDateTime, inputCls } from '../../../ui/inbound-chips';
import { Hint } from '../../../ui/info-tip';
import { fmtFollowUp } from '../../../models/reminders';
import { useCallLog } from '../hooks/use-call-log';

const btn = 'px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap disabled:opacity-50';

const SAME_NOTE_MS = 15 * 60 * 1000;

type Item = { kind: 'call'; ms: number; call: CallAttempt } | { kind: 'note'; ms: number; note: LeadNote };

const msOf = (iso: string | undefined) => {
  const ms = Date.parse(iso || '');
  return Number.isNaN(ms) ? 0 : ms;
};

function timeline(calls: CallAttempt[], notes: LeadNote[]): Item[] {
  const repeats = (n: LeadNote) => calls.some((c) =>
    c.note?.trim() && c.note.trim() === n.text.trim() && Math.abs(msOf(c.at) - msOf(n.ts)) < SAME_NOTE_MS);
  return [
    ...calls.map((call): Item => ({ kind: 'call', ms: msOf(call.at), call })),
    ...notes.filter((n) => n.text?.trim() && !repeats(n)).map((note): Item => ({ kind: 'note', ms: msOf(note.ts), note })),
  ].sort((a, b) => b.ms - a.ms);
}

function CallRow({ a }: { a: CallAttempt }) {
  const connected = a.outcome === 'Connected';
  return (
    <>
      <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${connected ? 'bg-[#0F766E] text-white' : 'bg-red-50 text-red-600 border border-red-200'}`}>{a.n}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[12.5px] font-medium text-gray-900">{connected ? 'Connected' : 'RNR'}{a.durationMin ? <span className="text-gray-500 font-normal"> · {a.durationMin} min</span> : null}</span>
          <span className="text-[11px] text-gray-400">{fmtLeadDateTime(a.at)}{a.by ? ` · ${a.by}` : ''}</span>
        </div>
        {a.note && <p className="text-[12px] text-gray-700 mt-0.5 whitespace-pre-wrap">{a.note}</p>}
        {a.followUpDate && <p className="text-[11px] text-gray-400 mt-0.5">Next follow-up {fmtFollowUp(a.followUpDate, a.followUpTime)}</p>}
      </div>
    </>
  );
}

function NoteRow({ n }: { n: LeadNote }) {
  return (
    <>
      <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-gray-100 text-gray-500 text-[11px]" aria-hidden>✎</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[12.5px] font-medium text-gray-900">Note</span>
          <span className="text-[11px] text-gray-400">{n.ts ? fmtLeadDateTime(n.ts) : ''}{n.author ? ` · ${n.author}` : ''}</span>
        </div>
        <p className="text-[12px] text-gray-700 mt-0.5 whitespace-pre-wrap">{n.text}</p>
      </div>
    </>
  );
}

export function InboundActivity({ draft, calls, readiness, onClose }: {
  draft: InboundLead;
  calls: ReturnType<typeof useCallLog>;
  readiness: ClosureReadiness;
  onClose: (reason: string) => void;
}) {
  const attempts = draft.callAttempts || [];
  const tally = callTally(attempts);
  const items = timeline(attempts, draft.notes || []);
  const { form, busy, error, today } = calls;
  const rule = `Close as unreachable at ${READY_RNR_COUNT} RNRs in ${READY_WINDOW_DAYS} days, or as no progress after ${READY_WINDOW_DAYS} days and ${MIN_ATTEMPTS_BEFORE_CLOSE} calls.`;

  return (
    <section className="bg-white rounded-lg border border-gray-200">
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-gray-100">
        <div className="text-[12.5px] min-w-0">
          <span className="text-gray-500">Next follow-up </span>
          {draft.followUpDate
            ? <span className={`font-semibold ${draft.followUpDate < today ? 'text-red-600' : 'text-gray-900'}`}>{fmtFollowUp(draft.followUpDate, draft.followUpTime)}</span>
            : <span className="font-semibold text-gray-500">not set</span>}
          <span className="text-gray-400"> · {tally.total ? `${tally.total} call${tally.total === 1 ? '' : 's'}, ${tally.connected} connected` : 'no calls yet'}</span>
        </div>
        {!form && (
          <div className="flex items-center gap-2">
            <button onClick={calls.logRnr} disabled={busy} className={`${btn} bg-white border border-red-200 text-red-600 hover:bg-red-50`}>
              {busy ? 'Saving…' : 'RNR'}
            </button>
            <button onClick={calls.openForm} disabled={busy} className={`${btn} bg-[#0F766E] text-white`}>Connected…</button>
            <Hint text="RNR: ring, no response. Saves at once and books the next working day with the same owner. Connected asks for minutes, the next follow-up and what was discussed." />
          </div>
        )}
      </div>

      <div className="px-4 py-3 flex flex-col gap-3">
        {readiness.ready ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[12px] text-amber-800">
              <span className="font-semibold">Ready to close.</span>{' '}
              {readiness.reason === 'unreachable'
                ? `${readiness.rnrInWindow} RNRs in the last ${READY_WINDOW_DAYS} days.`
                : `${readiness.ageDays} days in, ${tally.total} calls, still ${draft.stage}.`}
            </p>
            <button
              onClick={() => onClose(readiness.reason === 'unreachable' ? LOST_UNREACHABLE : LOST_STALLED)}
              className={`${btn} bg-white border border-red-200 text-red-600 hover:bg-red-50`}
            >
              Mark Lost: {readiness.reason === 'unreachable' ? 'unreachable' : 'no progress'}
            </button>
          </div>
        ) : tally.rnr > 0 && (
          <p className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
            {readiness.rnrInWindow} of {READY_RNR_COUNT} RNRs in the last {READY_WINDOW_DAYS} days
            <Hint text={rule} />
          </p>
        )}

        {form && (
          <div className="rounded-md border border-[#0F766E]/30 bg-[#0F766E]/[0.03] p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-semibold text-gray-900">Connected call {attempts.length + 1}</span>
              <button onClick={calls.closeForm} aria-label="Cancel" className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <Field label="Minutes" required>
                <input type="number" min={1} step={1} value={form.durationMin} onChange={(e) => calls.patchForm({ durationMin: e.target.value })}
                  className={error && !(Number(form.durationMin) > 0) ? errorInputCls : inputCls} />
              </Field>
              <Field label="Next follow-up" required>
                <input type="date" min={today} value={form.followUpDate} onChange={(e) => calls.patchForm({ followUpDate: e.target.value })}
                  className={error && !form.followUpDate ? errorInputCls : inputCls} />
              </Field>
              <Field label="Time" info="Optional. Reminders bring it forward an hour before.">
                <input type="time" value={form.followUpTime} onChange={(e) => calls.patchForm({ followUpTime: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <Field label="What was discussed" required info="Outreach and the KAM read this later, so write it for them.">
              <textarea value={form.note} onChange={(e) => calls.patchForm({ note: e.target.value })} rows={3}
                placeholder="Project, quantities, timeline, who decides, what you promised" className={inputCls + ' resize-none'} />
            </Field>
            {error && <GateErrors errors={calls.formErrors.length ? calls.formErrors : [error]} />}
            <div>
              <button onClick={calls.logConnected} disabled={busy} className={`${btn} bg-[#0F766E] text-white`}>{busy ? 'Saving…' : 'Save call'}</button>
            </div>
          </div>
        )}
        {!form && error && <GateErrors errors={[error]} />}

        <div className="flex items-start gap-2">
          <textarea
            value={calls.noteText}
            onChange={(e) => calls.setNoteText(e.target.value)}
            placeholder="Add a note for the next person on this client"
            rows={calls.noteText ? 3 : 1}
            className={inputCls + ' resize-none flex-1'}
          />
          <button
            onClick={calls.addNote}
            disabled={calls.busy || !calls.noteText.trim()}
            className={`${btn} border border-gray-200 bg-white text-gray-700 hover:border-gray-400`}
          >
            {calls.busy ? 'Saving…' : 'Add note'}
          </button>
        </div>

        {items.length === 0 ? <Empty>No calls or notes yet.</Empty> : (
          <ol className="flex flex-col divide-y divide-gray-100 max-h-[480px] overflow-y-auto -mx-1 px-1">
            {items.map((it, i) => (
              <li key={`${it.kind}-${it.ms}-${i}`} className="flex items-start gap-3 py-2.5">
                {it.kind === 'call' ? <CallRow a={it.call} /> : <NoteRow n={it.note} />}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
