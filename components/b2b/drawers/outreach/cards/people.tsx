'use client';

import { useState } from 'react';
import { OutreachLead } from '../../../models/mock-data';
import { Rep } from '../../../models/outreach/intake';
import { inputCls } from '../../../constants/ui';
import { Hint } from '../../../ui/info-tip';

const day = (iso: string | undefined) => (iso ? iso.slice(0, 10) : '');

function spocs(d: OutreachLead) {
  const h = d.handover;
  const ec = d.ecReferral;
  return [
    {
      label: 'Inbound',
      name: d.intake?.inboundOwner || '',
      detail: d.intake?.inboundOwner
        ? `sent ${day(d.intake.assignedAt)}${d.intake.inboundStage ? ` at ${d.intake.inboundStage}` : ''}`
        : 'not from Inbound',
    },
    {
      label: 'Outreach',
      name: d.bm || '',
      detail: d.bm ? `the BM who owns this lead${d.spok ? `; ${d.spok} is speaking to them` : ''}` : 'no BM yet, assign it from Assignments',
    },
    {
      label: 'KAM',
      name: h?.kam || d.kam || '',
      detail: h ? `handover ${h.status.toLowerCase()} (sent ${day(h.sentAt)})` : 'none until the handover is sent',
    },
    {
      label: 'EC',
      name: d.ecBmName || ec?.by || '',
      detail: [
        d.ecName ? `assisted at ${d.ecName}${d.ecBmName ? ` by ${d.ecBmName}` : ''}` : '',
        ec ? `referred from ${ec.ec} by ${ec.by} on ${day(ec.at)}` : '',
      ].filter(Boolean).join('; ') || 'no EC on this lead',
    },
  ];
}

export function OutreachPeople({ draft, reps, canPickBm, onPickBm }: {
  draft: OutreachLead;
  reps: Rep[];
  canPickBm: boolean;
  onPickBm: (rep: Rep) => void;
}) {
  const [open, setOpen] = useState(false);
  const rows = spocs(draft);
  const options = reps.filter((r) => r.name !== draft.bm);
  const info = [
    'One SPoC per team, across the whole journey.',
    ...rows.map((r) => `${r.label}: ${r.detail}`),
    canPickBm ? 'Reassign changes the BM; Save changes keeps it.' : 'A manager can reassign the BM.',
  ].join('\n');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[12px]">
        {rows.map((r) => (
          <span key={r.label} className="whitespace-nowrap">
            <span className="text-gray-400">{r.label} </span>
            <span className={r.name ? 'font-medium text-gray-800' : 'text-gray-300'}>{r.name || '—'}</span>
          </span>
        ))}
        <Hint text={info} />
        {canPickBm && options.length > 0 && (
          <button onClick={() => setOpen((o) => !o)} className="text-[12px] font-medium text-[#0F766E] hover:underline">
            {open ? 'Cancel' : 'Reassign'}
          </button>
        )}
      </div>
      {open && (
        <select
          value=""
          onChange={(e) => {
            const r = options.find((x) => x.name === e.target.value);
            if (r) { onPickBm(r); setOpen(false); }
          }}
          className={inputCls + ' max-w-[220px]'}
        >
          <option value="">Hand over to…</option>
          {options.map((r) => <option key={r.phone || r.name} value={r.name}>{r.name}</option>)}
        </select>
      )}
    </div>
  );
}
