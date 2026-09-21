'use client';

import { ClientEntity } from '../../../models/client';
import { LINK_STATE_COLOR, LINK_STATE_LABEL, PUSH_SKIP_LABEL, PartnerLinkState, PushSkipReason, planPartnerPush } from '../../../models/client/partner';
import { btnGhost, btnPrimary } from '../../../constants/ui';
import { PartnerPushResult, pushPartners } from '@/lib/b2b';
import { useMemo, useState } from 'react';

export function PartnerPushModal({ clients, onClose, onDone }: {
  clients: ClientEntity[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PartnerPushResult | null>(null);
  const [error, setError] = useState('');

  const plan = useMemo(() => planPartnerPush(clients), [clients]);

  const skipGroups = useMemo(() => {
    const groups = new Map<PushSkipReason, string[]>();
    for (const s of plan.skipped) {
      groups.set(s.reason, [...(groups.get(s.reason) ?? []), s.company || s.id]);
    }
    return [...groups.entries()];
  }, [plan.skipped]);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      setResult(await pushPartners(plan.rows));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[720px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">Push to partner dashboards</h2>
            <p className="text-[11px] text-gray-400">Creates the firm on Studio Sales. It does not issue a login.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <p className="text-[12px] text-gray-500">
            Each client below is matched to a firm on its contact number, exactly. A number that already belongs to a
            different client is reported back and never merged — that decision stays with a person, because the wrong
            link pays the wrong firm. Pressing this twice is safe: every write is keyed on the client id.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Tile label="Ready to push" value={plan.rows.length} tone="#0F766E" />
            <Tile label="Left out" value={plan.skipped.length} tone="#9CA3AF" />
          </div>

          {skipGroups.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 text-[10px] uppercase tracking-wider font-semibold text-gray-400">
                Why {plan.skipped.length} {plan.skipped.length === 1 ? 'client is' : 'clients are'} left out
              </div>
              <div className="divide-y divide-gray-100">
                {skipGroups.map(([reason, companies]) => (
                  <div key={reason} className="px-3 py-2">
                    <div className="text-[12px] font-semibold text-gray-700">
                      {PUSH_SKIP_LABEL[reason]} <span className="text-gray-400 font-normal">· {companies.length}</span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                      {companies.slice(0, 8).join(', ')}
                      {companies.length > 8 ? ` and ${companies.length - 8} more` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>
          )}

          {result && (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 text-[10px] uppercase tracking-wider font-semibold text-gray-400">
                What the partner dashboards did with {result.received}
              </div>
              <div className="px-3 py-2 grid grid-cols-3 gap-2">
                <Tile label="Created" value={result.created} tone="#0F766E" />
                <Tile label="Linked" value={result.linked} tone="#EAB308" />
                <Tile label="Already there" value={result.updated} tone="#9CA3AF" />
              </div>
              {result.skipped.length > 0 && (
                <div className="px-3 pb-3 flex flex-col gap-1">
                  <div className="text-[11px] font-semibold text-gray-600">
                    {result.skipped.length} needed a person to look
                  </div>
                  {result.skipped.map((s) => (
                    <div key={`${s.key}-${s.reason}`} className="text-[11px] text-gray-500 leading-snug">
                      <span className="font-mono text-gray-400">{s.key}</span> · {s.reason}
                      {s.detail ? ` — ${s.detail}` : ''}
                    </div>
                  ))}
                </div>
              )}
              <div className="px-3 pb-3 text-[11px] text-gray-400 leading-snug">
                No login was issued. A firm can be handed credentials from the Studio Sales console once somebody
                decides to.
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className={btnGhost}>{result ? 'Close' : 'Cancel'}</button>
          {!result && (
            <button onClick={run} disabled={busy || !plan.rows.length} className={btnPrimary}>
              {busy ? 'Pushing…' : `Push ${plan.rows.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{label}</div>
      <div className="text-[18px] font-bold" style={{ color: tone }}>{value}</div>
    </div>
  );
}

const LINK_STATE_HINT: Record<PartnerLinkState, string> = {
  power: 'Linked to a Studio Sales firm that can sign in',
  provisioned: 'The firm exists on Studio Sales but no login has been issued yet',
  none: 'No Studio Sales firm is linked to this client',
  unknown: 'The partner dashboards could not be read, so this is not known',
};

export function PartnerLinkPill({ state }: { state: PartnerLinkState }) {
  const c = LINK_STATE_COLOR[state];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ background: c + '18', color: c }}
      title={LINK_STATE_HINT[state]}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {LINK_STATE_LABEL[state]}
    </span>
  );
}
