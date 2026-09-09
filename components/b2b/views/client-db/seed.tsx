'use client';

import { btnGhost, btnPrimary } from '../../constants/ui';
import { ClientSeedPlan, planClientSeed } from '@/lib/b2b';
import { useEffect, useState } from 'react';

export function SeedModal({ onClose, onSeed }: {
  onClose: () => void;
  onSeed: (plan: ClientSeedPlan) => Promise<{ saved: number; errors: string[] }>;
}) {
  const [plan, setPlan] = useState<ClientSeedPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ saved: number; errors: string[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    planClientSeed([])
      .then(setPlan)
      .catch((e) => { console.error('[b2b] seed plan failed', e); setFailed(true); })
      .finally(() => setLoading(false));
  }, []);

  const run = async () => {
    if (!plan) return;
    setBusy(true);
    setResult(await onSeed(plan));
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[720px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">Seed the Client Database</h2>
            <p className="text-[11px] text-gray-400">From closed Inbound / Outreach leads and the KAM board</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-3">
          <p className="text-[12px] text-gray-500">
            PRD open question #4 asks whether a Procurement export is needed to seed order history.
            It is not — Order Details is derived from the deal tickets, which already hold every historical order.
            What needs seeding is the entity list, and the CRM already names every client it has closed.
            <span className="block mt-1">
              Matching is <span className="font-semibold">exact on the contact number</span>. A similar company name
              is never treated as the same client; those pairs show up on the Merge screen for a human to decide.
            </span>
          </p>

          {loading && <p className="text-[12px] text-gray-400">Reading the lead boards…</p>}
          {failed && <p className="text-[12px] text-red-600">Could not read the lead boards. Nothing was written — close and retry.</p>}

          {plan && (
            <>
              <div className="flex gap-2 flex-wrap text-[11px]">
                <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-700 font-semibold">{plan.create.length} to create</span>
                <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-semibold">{plan.alreadyLinked.length} already in the master</span>
                {!!plan.unusable.length && <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-semibold">{plan.unusable.length} without a usable number</span>}
              </div>

              {!!plan.unusable.length && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                  {plan.unusable.length} record{plan.unusable.length === 1 ? '' : 's'}{' '}
                  name a company but carry no valid{' '}
                  10-digit number, so no order could ever be linked to them. They are skipped, not guessed at —
                  add them by hand once you have a number.
                </p>
              )}

              {!plan.create.length ? (
                <p className="text-[12px] text-gray-400">Nothing new to seed.</p>
              ) : (
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <div className="max-h-[280px] overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr className="text-gray-400 text-[9px] uppercase tracking-wider">
                          <th className="text-left font-semibold px-2 py-1.5">Company</th>
                          <th className="text-left font-semibold px-2 py-1.5">Number</th>
                          <th className="text-left font-semibold px-2 py-1.5">Source</th>
                          <th className="text-left font-semibold px-2 py-1.5">KAM</th>
                          <th className="text-left font-semibold px-2 py-1.5">From</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.create.map((c) => (
                          <tr key={c.phone} className="border-t border-gray-100">
                            <td className="px-2 py-1.5 font-medium text-gray-700">{c.company}</td>
                            <td className="px-2 py-1.5 font-mono text-gray-500">{c.phone}</td>
                            <td className="px-2 py-1.5 text-gray-500">{c.source}</td>
                            <td className="px-2 py-1.5 text-gray-500">{c.kam || <span className="text-gray-300">—</span>}</td>
                            <td className="px-2 py-1.5 text-gray-400">{c.origin}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {result && (
                <div className={`text-[12px] rounded-md px-2 py-1.5 ${result.errors.length ? 'bg-amber-50 border border-amber-200 text-amber-900' : 'bg-green-50 border border-green-200 text-green-800'}`}>
                  {result.saved} client{result.saved === 1 ? '' : 's'}{' '}written.
                  {!!result.errors.length && ` ${result.errors.length} failed: ${result.errors.slice(0, 3).join('; ')}`}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className={btnGhost}>{result ? 'Close' : 'Cancel'}</button>
          <button onClick={run} disabled={busy || !plan?.create.length || !!result} className={btnPrimary}>
            {busy ? 'Writing…' : `Create ${plan?.create.length || 0} clients`}
          </button>
        </div>
      </div>
    </div>
  );
}
