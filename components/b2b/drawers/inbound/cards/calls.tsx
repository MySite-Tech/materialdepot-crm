'use client';

import { MAX_CALL_ATTEMPTS } from '../../../constants/inbound';
import { CallLogEntry, InboundLead } from '../../../models/mock-data';
import { CallAttempt, CallAttemptOutcome } from '../../../types/inbound';
import { Empty, Field, GateErrors, ProvenanceChip, SectionCard, Spinner, errorInputCls, fmtLeadDateTime } from '../../../ui/inbound-chips';
import { inputCls } from '../../../constants/ui';
import { Dispatch, SetStateAction } from 'react';

export function InboundCallsCard({ attemptNo, attempts, callLogs, callsLoading, connected, detailLoading, draft, exhausted, logAttempt, logDuration, logError, logFollowUp, logNote, logOpen, logOutcome, logging, openCallSummary, phoneId, setDraft, setLogDuration, setLogError, setLogFollowUp, setLogNote, setLogOpen, setLogOutcome }: {
  attemptNo: number;
  attempts: CallAttempt[];
  callLogs: CallLogEntry[];
  callsLoading: boolean;
  connected: boolean;
  detailLoading: boolean;
  draft: InboundLead;
  exhausted: boolean;
  logAttempt: () => Promise<void>;
  logDuration: string;
  logError: string | null;
  logFollowUp: string;
  logNote: string;
  logOpen: boolean;
  logOutcome: CallAttemptOutcome;
  logging: boolean;
  openCallSummary: (callLogId: string) => Promise<void>;
  phoneId: number | undefined;
  setDraft: Dispatch<SetStateAction<InboundLead>>;
  setLogDuration: Dispatch<SetStateAction<string>>;
  setLogError: Dispatch<SetStateAction<string | null>>;
  setLogFollowUp: Dispatch<SetStateAction<string>>;
  setLogNote: Dispatch<SetStateAction<string>>;
  setLogOpen: Dispatch<SetStateAction<boolean>>;
  setLogOutcome: Dispatch<SetStateAction<CallAttemptOutcome>>;
}) {
  return (
    <SectionCard
      title="Call log"
      owner="crm"
      subtitle={`Attempt ${Math.min(attemptNo, MAX_CALL_ATTEMPTS)} of ${MAX_CALL_ATTEMPTS}`}
      right={!logOpen && (
        <button
          onClick={() => { setLogOpen(true); setLogFollowUp(draft.followUpDate || ''); }}
          className="border border-gray-200 bg-white text-gray-600 px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap hover:border-[#0F766E] hover:text-[#0F766E]"
        >
          ＋ Log attempt
        </button>
      )}
    >
    
      <div className="flex items-center gap-2 mb-3">
        {Array.from({ length: MAX_CALL_ATTEMPTS }, (_, i) => {
          const a = attempts[i];
          const isNext = !a && i + 1 === attemptNo && !connected;
          const bg = a?.outcome === 'Connected' ? 'bg-[#0F766E] text-white border-[#0F766E]'
            : a?.outcome === 'RNR' ? 'bg-red-50 text-red-600 border-red-200'
              : isNext ? 'bg-white text-gray-500 border-dashed border-gray-400'
                : 'bg-gray-50 text-gray-300 border-gray-200';
          return (
            <div
              key={i}
              title={a ? `${a.outcome} · ${fmtLeadDateTime(a.at)}${a.note ? ` · ${a.note}` : ''}` : `Attempt ${i + 1} not made`}
              className={`flex-1 rounded-md border px-2 py-1.5 text-center ${bg}`}
            >
              <div className="text-[9px] font-bold uppercase tracking-wider opacity-70">Call {i + 1}</div>
              <div className="text-[11px] font-semibold mt-0.5">
                {a ? (a.outcome === 'Connected' ? 'Connected' : 'RNR') : isNext ? 'Next' : '—'}
              </div>
            </div>
          );
        })}
      </div>
    
      {draft.presalesMissedCalls ? (
        <p className="text-[10px] text-gray-400 mb-3 leading-snug">
          Presales already recorded {draft.presalesMissedCalls} missed{' '}
          {draft.presalesMissedCalls === 1 ? 'call' : 'calls'} in Kylas before handover. The
          four attempts above are your team&apos;s own, counted separately.
        </p>
      ) : null}
    
      {exhausted && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 mb-3">
          <p className="text-[11px] text-amber-800 leading-snug font-semibold">
            Four attempts, none connected.
          </p>
          <p className="text-[11px] text-amber-700 leading-snug mt-0.5">
            The PRD calls for marking this Lost as unreachable, or parking it on a long-term
            follow-up date.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setDraft((d) => ({ ...d, stage: 'Lost', lostReason: 'Unreachable (4 attempts)' }))}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white border border-red-200 text-red-600 hover:bg-red-50"
            >
              Mark Lost — unreachable
            </button>
            <button
              onClick={() => setLogOpen(true)}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white border border-gray-200 text-gray-600 hover:border-[#0F766E] hover:text-[#0F766E]"
            >
              Park on a later date
            </button>
          </div>
        </div>
      )}
    
      {logOpen && (
        <div className="rounded-md border border-gray-200 bg-gray-50/60 p-3 mb-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-700">
              Attempt {attemptNo}{attemptNo > MAX_CALL_ATTEMPTS ? ' (beyond the PRD’s four)' : ''}
            </span>
            <button onClick={() => { setLogOpen(false); setLogError(null); }} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <Field label="Outcome">
              <select value={logOutcome} onChange={(e) => setLogOutcome(e.target.value as CallAttemptOutcome)} className={inputCls}>
                <option value="Connected">Connected</option>
                <option value="RNR">RNR — ring no response</option>
              </select>
            </Field>
            {logOutcome === 'Connected' && (
              <Field label="Duration (mins)">
                <input type="number" min={0} value={logDuration} onChange={(e) => setLogDuration(e.target.value)} className={inputCls} />
              </Field>
            )}
            <Field label="Next follow-up" required>
              <input
                type="date"
                value={logFollowUp}
                onChange={(e) => { setLogFollowUp(e.target.value); setLogError(null); }}
                className={logError && !logFollowUp ? errorInputCls : inputCls}
              />
            </Field>
          </div>
          <Field label="What was discussed">
            <textarea value={logNote} onChange={(e) => setLogNote(e.target.value)} rows={2} className={inputCls + ' resize-none'} />
          </Field>
          <p className="text-[10px] text-gray-400 leading-snug">
            Saves the attempt here and the call in Kylas. Every logged call needs the next
            follow-up date — that date is what puts the lead on tomorrow&apos;s list.
          </p>
          {logError && <GateErrors errors={[logError]} />}
          <div className="flex items-center gap-2">
            <button
              onClick={logAttempt}
              disabled={logging}
              className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold disabled:opacity-50"
            >
              {logging ? 'Saving…' : 'Save attempt'}
            </button>
            {!phoneId && !detailLoading && (
              <span className="text-[10px] text-amber-700">
                No Kylas phone id — the attempt saves here but not as a Kylas call log.
              </span>
            )}
          </div>
        </div>
      )}
    
      {attempts.length > 0 && (
        <div className="flex flex-col divide-y divide-gray-100 mb-3">
          {attempts.slice().reverse().map((a, i) => (
            <div key={`${a.n}-${i}`} className="flex items-start gap-3 py-2">
              <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                a.outcome === 'Connected' ? 'bg-[#0F766E] text-white' : 'bg-red-100 text-red-600'
              }`}>{a.n}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-gray-800">{a.outcome}</div>
                <div className="text-[10px] text-gray-400">{fmtLeadDateTime(a.at)}{a.by ? ` · ${a.by}` : ''}</div>
                {a.note && <div className="text-[11px] text-gray-600 mt-0.5">{a.note}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    
      <div className="border-t border-gray-100 pt-2.5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Kylas call records</span>
          <ProvenanceChip owner="kylas" />
          {!callsLoading && <span className="text-[10px] text-gray-400">{callLogs.length}</span>}
        </div>
        {callsLoading ? <Spinner label="Loading call records…" />
          : callLogs.length === 0 ? <Empty>No calls recorded in Kylas.</Empty>
            : (
              <div className="flex flex-col divide-y divide-gray-100 max-h-[220px] overflow-y-auto">
                {callLogs.map((c) => {
                  const ok = /connect|complete|answer/i.test(c.status);
                  return (
                    <div key={c.id} className="flex items-center gap-2.5 py-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${ok ? 'bg-[#0F766E] text-white' : 'bg-gray-100 text-gray-400'}`}>
                        {/inbound/i.test(c.direction) ? '↓' : '↑'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold text-gray-800">
                          {c.status}
                          {c.durationSec ? <span className="text-gray-400 font-normal"> · {Math.floor(c.durationSec / 60)}m {c.durationSec % 60}s</span> : null}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate">{c.direction}{c.ts ? ` · ${c.ts}` : ''}{c.by ? ` · ${c.by}` : ''}</div>
                      </div>
                      <button
                        onClick={() => openCallSummary(c.id)}
                        className="shrink-0 border border-gray-200 bg-white text-gray-500 px-2 py-0.5 rounded text-[10px] font-semibold hover:border-[#0F766E] hover:text-[#0F766E]"
                      >
                        Summary
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
      </div>
    </SectionCard>
  );
}
