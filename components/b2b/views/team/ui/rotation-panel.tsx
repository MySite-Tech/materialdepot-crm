'use client';

import { useState } from 'react';
import { runInboundRotation } from '@/lib/b2b/team';
import type { RotationOutcome } from '@/lib/b2b/team/types';

export function RotationPanel({ rotationSize }: { rotationSize: number }) {
  const [result, setResult] = useState<RotationOutcome | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (dryRun: boolean) => {
    setRunning(true);
    setError(null);
    runInboundRotation(dryRun)
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : 'Rotation failed'))
      .finally(() => setRunning(false));
  };

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-gray-900">Inbound round robin</h3>
          <p className="text-[12px] text-gray-500 mt-0.5">
            New leads that land on the intake owner in Kylas are shared in turn across the{' '}
            {rotationSize} {rotationSize === 1 ? 'person' : 'people'}{' '}marked &ldquo;Gets new leads&rdquo;.
            It runs whenever someone opens Inbound Leads; these buttons run it on demand.
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
            disabled={running || rotationSize === 0}
            onClick={() => run(false)}
            className="px-3 py-1.5 text-[12px] font-semibold rounded bg-[#1A1A1A] text-white disabled:opacity-40"
          >
            {running ? 'Running…' : 'Assign now'}
          </button>
        </div>
      </div>
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
