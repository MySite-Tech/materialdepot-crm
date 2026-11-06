'use client';

import { useEffect, useState } from 'react';
import { runInboundRotation } from '@/lib/b2b/team';
import { INBOUND_BACKLOG_BATCH } from '@/lib/b2b/team/constants';
import type { RotationOutcome, TeamMember } from '@/lib/b2b/team/types';

export function RotationPanel({ rotation }: { rotation: TeamMember[] }) {
  const [result, setResult] = useState<RotationOutcome | null>(null);
  const [backlog, setBacklog] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (dryRun: boolean, dealBacklog = false) => {
    setRunning(true);
    setError(null);
    runInboundRotation(dryRun, dealBacklog)
      .then((r) => {
        setResult(r);
        setBacklog((b) => (dealBacklog ? Math.max(0, (b ?? 0) - r.assigned.length) : r.backlog));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Rotation failed'))
      .finally(() => setRunning(false));
  };

  useEffect(() => { run(true); }, []);

  const names = rotation.map((m) => m.name);

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 max-w-[680px]">
          <h3 className="text-[14px] font-semibold text-gray-900">Inbound round robin</h3>
          <p className="text-[12px] text-gray-500 mt-0.5">
            {names.length
              ? <>New inbound leads go in turn to <b className="text-gray-800">{names.join(', ')}</b>.</>
              : <span className="text-amber-700">Nobody is marked &ldquo;Gets new leads&rdquo;, so new leads stay on the intake owner.</span>}{' '}
            It runs whenever someone opens Inbound Leads; these buttons run it on demand.
          </p>
          <p className="text-[11.5px] text-gray-400 mt-1">
            Kylas hands every qualified lead to its intake user, and the CRM never writes back to Kylas, so Kylas keeps
            showing that user as owner. The owner on the CRM is the real one.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            disabled={running}
            onClick={() => run(true)}
            className="px-3 py-1.5 text-[12px] font-medium border border-gray-200 rounded hover:bg-gray-50"
          >
            Preview
          </button>
          <button
            disabled={running || names.length === 0}
            onClick={() => run(false)}
            className="px-3 py-1.5 text-[12px] font-semibold rounded bg-[#1A1A1A] text-white disabled:opacity-40"
          >
            {running ? 'Running…' : 'Assign now'}
          </button>
        </div>
      </div>
      {!!backlog && (
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <span>
            {backlog} older {backlog === 1 ? 'lead' : 'leads'} from before the round robin started still sit on the intake owner,
            never called. They are not dealt automatically.
          </span>
          <button
            disabled={running || names.length === 0}
            onClick={() => run(false, true)}
            className="px-3 py-1 text-[12px] font-semibold rounded border border-amber-300 bg-white hover:bg-amber-100 disabled:opacity-40"
          >
            Deal {Math.min(backlog, INBOUND_BACKLOG_BATCH)} to {names.length === 1 ? names[0] : 'the rotation'}
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-[12px] text-red-600">{error}</p>}
      {result && (
        <div className="mt-3 text-[12px] text-gray-700">
          {result.skipped ? (
            <p className="text-amber-700">{result.skipped}</p>
          ) : (
            <>
              <p className="font-medium">
                {result.dryRun ? 'Would assign' : 'Assigned'} {result.assigned.length}{' '}
                {result.assigned.length === 1 ? 'lead' : 'leads'}
                {result.waiting > 0 && `, ${result.waiting} more waiting for the next run`}
                {result.failed.length > 0 && `, ${result.failed.length} failed`}.
              </p>
              {result.assigned.length > 0 && (
                <ul className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 font-mono text-[11.5px] text-gray-500">
                  {result.assigned.map((a) => <li key={a.leadId}>{a.leadId} → {a.to}</li>)}
                </ul>
              )}
              {result.failed.map((f) => (
                <p key={f.leadId} className="text-red-600 font-mono text-[11.5px]">{f.leadId}: {f.error}</p>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
