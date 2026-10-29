'use client';

import { OutreachLead } from '../../../models/mock-data';
import { ASSIGN_REJECT_REASONS, INTAKE_REJECT_REASONS } from '../../../models/outreach/intake';
import { Empty, fmtDay } from '../../../ui/inbound-chips';
import { useState } from 'react';

const th = 'px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap';
const btn = 'px-2.5 py-1 text-[11px] font-semibold rounded-md whitespace-nowrap disabled:opacity-50';

function PendingRow({ lead, canAct, onAccept, onReject, onOpen }: {
  lead: OutreachLead; canAct: boolean;
  onAccept: () => void; onReject: (reason: string) => void; onOpen: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const fromInbound = lead.intake?.from === 'Inbound';
  const reasons = fromInbound ? INTAKE_REJECT_REASONS : ASSIGN_REJECT_REASONS;
  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="px-3 py-2 font-semibold text-gray-900 max-w-[200px] truncate cursor-pointer hover:underline" onClick={onOpen}>{lead.company}</td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{lead.contactPerson || '—'}</td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
        {fromInbound ? `Inbound${lead.intake?.inboundOwner ? ` · ${lead.intake.inboundOwner}` : ''}` : lead.intake?.from || lead.source || '—'}
      </td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
        {lead.intake?.assignedBy || '—'}
        {lead.intake?.how === 'round-robin' && <span className="ml-1 text-[10px] text-gray-400">round robin</span>}
      </td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{lead.bm}</td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDay(lead.intake?.assignedAt)}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        {!canAct ? <span className="text-[11px] text-gray-400">Waiting on {lead.bm}</span>
          : rejecting ? (
            <div className="flex items-center gap-1.5">
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="px-2 py-1 text-[11px] border border-gray-200 rounded-md bg-white">
                <option value="">Why?</option>
                {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button disabled={!reason} onClick={() => onReject(reason)} className={`${btn} bg-red-600 text-white`}>Reject</button>
              <button onClick={() => setRejecting(false)} className={`${btn} border border-gray-200 text-gray-500`}>Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button onClick={onAccept} className={`${btn} bg-[#0F766E] text-white`}>Accept</button>
              <button onClick={() => setRejecting(true)} className={`${btn} border border-gray-200 text-gray-600`}>Reject…</button>
            </div>
          )}
      </td>
    </tr>
  );
}

export function PendingSection({ pending, canAct, onOpen, onAccept, onReject }: {
  pending: OutreachLead[];
  canAct: (l: OutreachLead) => boolean;
  onOpen: (id: string) => void;
  onAccept: (l: OutreachLead) => void;
  onReject: (l: OutreachLead, reason: string) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-baseline gap-2"
        title="A lead counts as the BM's only once they accept. A rejection needs a reason. A rejected Inbound lead closes as Lost, because those reasons score Inbound's lead quality. Any other rejected lead goes back to the unassigned pool.">
        <h3 className="text-[12px] font-bold text-gray-800">Waiting for sign-off</h3>
        <span className="text-[11px] font-semibold text-gray-400">{pending.length}</span>
        <span className="text-[10.5px] text-gray-400 hidden sm:inline">Accept, or reject with a reason</span>
      </div>
      {!pending.length ? <div className="py-6"><Empty>Nothing waiting.</Empty></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-gray-100 bg-gray-50/60">
              {['Firm', 'Contact', 'From', 'Assigned by', 'Assigned to', 'Assigned', ''].map((h) => <th key={h} className={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {pending.map((l) => (
                <PendingRow key={l.id} lead={l} canAct={canAct(l)} onOpen={() => onOpen(l.id)}
                  onAccept={() => onAccept(l)} onReject={(reason) => onReject(l, reason)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
