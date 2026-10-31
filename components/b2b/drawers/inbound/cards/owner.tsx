'use client';

import { useState } from 'react';
import { reassignInboundLead } from '@/lib/b2b/team';
import type { TeamMember } from '@/lib/b2b/team/types';
import { InboundLead } from '../../../models/mock-data';
import { SectionCard } from '../../../ui/inbound-chips';
import { ClientSpocs } from '../../../models/inbound';
import { inputCls } from '../../../constants/ui';

const ROLES: { key: keyof ClientSpocs; label: string }[] = [
  { key: 'inbound', label: 'Inbound SPoC' },
  { key: 'outreach', label: 'Outreach SPoC' },
  { key: 'kam', label: 'KAM SPoC' },
  { key: 'ec', label: 'EC SPoC' },
];

export function InboundOwnerCard({ draft, spocs, spocsLoading, members, canReassign, onReassigned }: {
  draft: InboundLead;
  spocs: ClientSpocs;
  spocsLoading: boolean;
  members: TeamMember[];
  canReassign: boolean;
  onReassigned: (to: TeamMember) => Promise<string | undefined>;
}) {
  const [toPhone, setToPhone] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = members.filter((m) => m.active && m.kylasUserId !== draft.ownerId);

  const submit = () => {
    const to = options.find((m) => m.phone === toPhone);
    if (!to || saving) return;
    setSaving(true);
    setError(null);
    reassignInboundLead(draft.id, to.phone, reason)
      .then(() => onReassigned(to))
      .then((failed) => { if (failed) { setError(failed); return; } setToPhone(''); setReason(''); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Reassign failed'))
      .finally(() => setSaving(false));
  };

  return (
    <SectionCard title="People on this client" subtitle="One SPoC per team, across the whole journey">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ROLES.map(({ key, label }) => {
          const s = spocs[key];
          return (
            <div key={key} className="rounded-md border border-gray-100 bg-gray-50/60 px-2.5 py-2 min-w-0">
              <div className="text-[9.5px] font-bold uppercase tracking-wider text-gray-400">{label}</div>
              <div className={`text-[12.5px] font-semibold truncate ${s.name ? 'text-gray-800' : 'text-gray-400'}`}>
                {spocsLoading && key !== 'inbound' ? '…' : s.name || '—'}
              </div>
              <div className="text-[10px] text-gray-400 leading-snug">{spocsLoading && key !== 'inbound' ? 'loading' : s.detail}</div>
            </div>
          );
        })}
      </div>
      {canReassign && options.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <select value={toPhone} onChange={(e) => setToPhone(e.target.value)} className={inputCls + ' max-w-[200px]'}>
            <option value="">Hand over to…</option>
            {options.map((m) => <option key={m.phone} value={m.phone}>{m.name}</option>)}
          </select>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why (e.g. Hardi on leave)"
            className={inputCls + ' flex-1 min-w-[160px]'}
          />
          <button
            disabled={!toPhone || saving}
            onClick={submit}
            className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#1A1A1A] text-white disabled:opacity-40"
          >
            {saving ? 'Reassigning…' : 'Reassign'}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
    </SectionCard>
  );
}
