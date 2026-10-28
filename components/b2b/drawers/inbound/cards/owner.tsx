'use client';

import { useState } from 'react';
import { reassignInboundLead } from '@/lib/b2b/team';
import type { TeamMember } from '@/lib/b2b/team/types';
import { InboundLead } from '../../../models/mock-data';
import { SectionCard } from '../../../ui/inbound-chips';
import { inputCls } from '../../../constants/ui';

export function InboundOwnerCard({ draft, members, canReassign, onReassigned }: {
  draft: InboundLead;
  members: TeamMember[];
  canReassign: boolean;
  onReassigned: (to: TeamMember) => void;
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
      .then(() => { onReassigned(to); setToPhone(''); setReason(''); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Reassign failed'))
      .finally(() => setSaving(false));
  };

  return (
    <SectionCard title="Owner" owner="kylas-write" subtitle="Who this lead belongs to in Kylas">
      <p className="text-[13px] text-gray-800">
        <span className="font-semibold">{draft.owner || 'Unassigned'}</span>
        <span className="text-gray-400"> owns this lead. Calls stay credited to whoever made them.</span>
      </p>
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
