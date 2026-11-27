'use client';

import { useState } from 'react';
import { reassignInboundLead } from '@/lib/b2b/team';
import type { TeamMember } from '@/lib/b2b/team/types';
import { kylasOwnerNote } from '@/lib/b2b/team/utils';
import { InboundLead } from '../../../models/mock-data';
import { ClientSpocs } from '../../../models/inbound';
import { inputCls } from '../../../constants/ui';
import { Hint } from '../../../ui/info-tip';

const ROLES: { key: keyof ClientSpocs; label: string }[] = [
  { key: 'inbound', label: 'Inbound' },
  { key: 'outreach', label: 'Outreach' },
  { key: 'kam', label: 'KAM' },
  { key: 'ec', label: 'EC' },
];

export function InboundPeople({ draft, spocs, spocsLoading, members, canReassign, onReassigned }: {
  draft: InboundLead;
  spocs: ClientSpocs;
  spocsLoading: boolean;
  members: TeamMember[];
  canReassign: boolean;
  onReassigned: (to: TeamMember) => Promise<string | undefined>;
}) {
  const [open, setOpen] = useState(false);
  const [toPhone, setToPhone] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = members.filter((m) => m.active && m.kylasUserId !== draft.ownerId);
  const loadingFor = (k: keyof ClientSpocs) => spocsLoading && k !== 'inbound';
  const info = ['One SPoC per team, across the whole journey.', ...ROLES.map(({ key, label }) => `${label}: ${loadingFor(key) ? 'loading' : spocs[key].detail}`)].join('\n');

  const submit = () => {
    const to = options.find((m) => m.phone === toPhone);
    if (!to || saving) return;
    setSaving(true);
    setError(null);
    reassignInboundLead(draft.id, to.phone, reason)
      .then(async ({ kylas }) => (await onReassigned(to)) || kylasOwnerNote(kylas))
      .then((failed) => { setToPhone(''); setReason(''); setOpen(false); if (failed) setError(failed); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Reassign failed'))
      .finally(() => setSaving(false));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[12px]">
        {ROLES.map(({ key, label }) => {
          const name = loadingFor(key) ? '…' : spocs[key].name;
          return (
            <span key={key} className="whitespace-nowrap">
              <span className="text-gray-400">{label} </span>
              <span className={name ? 'font-medium text-gray-800' : 'text-gray-300'}>{name || '—'}</span>
            </span>
          );
        })}
        <Hint text={info} />
        {canReassign && options.length > 0 && (
          <button onClick={() => setOpen((o) => !o)} className="text-[12px] font-medium text-[#0F766E] hover:underline">
            {open ? 'Cancel' : 'Reassign'}
          </button>
        )}
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={toPhone} onChange={(e) => setToPhone(e.target.value)} className={inputCls + ' max-w-[200px]'}>
            <option value="">Hand over to…</option>
            {options.map((m) => <option key={m.phone} value={m.phone}>{m.name}</option>)}
          </select>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why (e.g. on leave)" className={inputCls + ' flex-1 min-w-[160px]'} />
          <button disabled={!toPhone || saving} onClick={submit} className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#1A1A1A] text-white disabled:opacity-40">
            {saving ? 'Reassigning…' : 'Reassign'}
          </button>
        </div>
      )}
      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
