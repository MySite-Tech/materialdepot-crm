'use client';

export function EmptyAuditorPool({ err, anyLoaded, onRetry }: { err: boolean; anyLoaded: boolean; onRetry?: () => void }) {
  if (err) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] font-semibold text-red-700">
        ⚠ Couldn&apos;t load the auditor list, so there&apos;s nobody to assign — this is a connection problem, not an empty roster. Retrying automatically.
        {onRetry ? <button onClick={onRetry} className="ml-2 rounded-md border border-red-300 bg-white px-2 py-0.5 text-[11.5px] font-semibold text-red-700">Retry now</button> : null}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] font-semibold text-amber-800">
      {anyLoaded
        ? '⚠ No auditors are registered in this city. Switch the city filter to assign someone from another city.'
        : '⚠ No auditors are registered yet — add them under Auditors & caps before assigning.'}
    </div>
  );
}
