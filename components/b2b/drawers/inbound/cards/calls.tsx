'use client';

import { LOST_STALLED, LOST_UNREACHABLE, MIN_ATTEMPTS_BEFORE_CLOSE, READY_RNR_COUNT, READY_WINDOW_DAYS } from '../../../constants/inbound';
import { callTally } from '../../../models/inbound';
import { InboundLead } from '../../../models/mock-data';
import { ClosureReadiness } from '../../../types/inbound';
import { Empty, Field, GateErrors, SectionCard, errorInputCls, fmtDay, fmtLeadDateTime, inputCls } from '../../../ui/inbound-chips';
import { useCallLog } from '../hooks/use-call-log';

const btn = 'px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap disabled:opacity-50';

export function InboundCallsCard({ draft, calls, readiness, onClose }: {
  draft: InboundLead;
  calls: ReturnType<typeof useCallLog>;
  readiness: ClosureReadiness;
  onClose: (reason: string) => void;
}) {
  const attempts = draft.callAttempts || [];
  const tally = callTally(attempts);
  const { form, busy, error, today } = calls;

  return (
    <SectionCard
      title="Call log"
      owner="crm"
      subtitle={tally.total ? `${tally.total} call${tally.total === 1 ? '' : 's'} · ${tally.connected} connected · ${tally.rnr} RNR` : 'No calls yet'}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-md bg-gray-50 border border-gray-100 px-3 py-2 mb-3">
        <div className="text-[12px]">
          <span className="text-gray-400">Next follow-up </span>
          {draft.followUpDate
            ? <strong className={draft.followUpDate < today ? 'text-red-600' : 'text-gray-800'}>{fmtDay(draft.followUpDate)}</strong>
            : <strong className="text-gray-500">not set</strong>}
          <span className="text-gray-400"> · set by the last call, with {draft.owner || 'the owner'}</span>
        </div>
        {!form && (
          <div className="flex items-center gap-2">
            <button onClick={calls.logRnr} disabled={busy} className={`${btn} bg-white border border-red-200 text-red-600 hover:bg-red-50`}
              title="Ring, no response. Saves now and books the next working day with the same owner.">
              {busy ? 'Saving…' : 'RNR'}
            </button>
            <button onClick={calls.openForm} disabled={busy} className={`${btn} bg-[#0F766E] text-white`}>
              Connected…
            </button>
          </div>
        )}
      </div>

      {readiness.ready ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 mb-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11.5px] text-amber-800 leading-snug">
            <strong>Ready to close.</strong>{' '}
            {readiness.reason === 'unreachable'
              ? `${readiness.rnrInWindow} RNRs in the last ${READY_WINDOW_DAYS} days.`
              : `${readiness.ageDays} days in, ${tally.total} calls, and it never moved past ${draft.stage}.`}
          </p>
          <button
            onClick={() => onClose(readiness.reason === 'unreachable' ? LOST_UNREACHABLE : LOST_STALLED)}
            className={`${btn} bg-white border border-red-200 text-red-600 hover:bg-red-50`}
          >
            Mark Lost — {readiness.reason === 'unreachable' ? 'unreachable' : 'no progress'}
          </button>
        </div>
      ) : tally.rnr > 0 && (
        <p className="text-[10.5px] text-gray-400 mb-3 leading-snug">
          {readiness.rnrInWindow} of {READY_RNR_COUNT} RNRs in the last {READY_WINDOW_DAYS} days · day {readiness.ageDays + 1} of {READY_WINDOW_DAYS}.
          It can be closed as unreachable at {READY_RNR_COUNT}, or as no progress after {READY_WINDOW_DAYS} days and {MIN_ATTEMPTS_BEFORE_CLOSE} calls.
        </p>
      )}

      {form && (
        <div className="rounded-md border border-[#0F766E]/30 bg-[#0F766E]/[0.03] p-3 mb-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-700">Connected call {attempts.length + 1}</span>
            <button onClick={calls.closeForm} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Field label="Duration (minutes)" required>
              <input type="number" min={1} step={1} value={form.durationMin} onChange={(e) => calls.patchForm({ durationMin: e.target.value })}
                className={error && !(Number(form.durationMin) > 0) ? errorInputCls : inputCls} />
            </Field>
            <Field label="Next follow-up" required>
              <input type="date" min={today} value={form.followUpDate} onChange={(e) => calls.patchForm({ followUpDate: e.target.value })}
                className={error && !form.followUpDate ? errorInputCls : inputCls} />
            </Field>
          </div>
          <Field label="What was discussed" required hint="Outreach and the KAM read this later — write it for them.">
            <textarea value={form.note} onChange={(e) => calls.patchForm({ note: e.target.value })} rows={3}
              placeholder="Project, quantities, timeline, who decides, what you promised…" className={inputCls + ' resize-none'} />
          </Field>
          {error && <GateErrors errors={calls.formErrors.length ? calls.formErrors : [error]} />}
          <div>
            <button onClick={calls.logConnected} disabled={busy} className={`${btn} bg-[#0F766E] text-white`}>
              {busy ? 'Saving…' : 'Save call'}
            </button>
          </div>
        </div>
      )}
      {!form && error && <div className="mb-3"><GateErrors errors={[error]} /></div>}

      {attempts.length === 0 ? <Empty>No calls logged by the B2B team yet.</Empty> : (
        <ol className="flex flex-col divide-y divide-gray-100 max-h-[360px] overflow-y-auto">
          {attempts.slice().reverse().map((a, i) => (
            <li key={`${a.n}-${i}`} className="flex items-start gap-3 py-2.5">
              <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                a.outcome === 'Connected' ? 'bg-[#0F766E] text-white' : 'bg-red-50 text-red-600 border border-red-200'
              }`}>{a.n}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[12px] font-semibold text-gray-800">{a.outcome === 'Connected' ? 'Connected' : 'RNR'}</span>
                  {a.durationMin ? <span className="text-[11px] text-gray-500">{a.durationMin} min</span> : null}
                  <span className="text-[10.5px] text-gray-400">{fmtLeadDateTime(a.at)}{a.by ? ` · ${a.by}` : ''}</span>
                </div>
                {a.note && <p className="text-[11.5px] text-gray-700 mt-0.5 whitespace-pre-wrap">{a.note}</p>}
                {a.followUpDate && <p className="text-[10.5px] text-gray-400 mt-0.5">Next follow-up → {fmtDay(a.followUpDate)}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
