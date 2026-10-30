'use client';

import { OutreachLead } from '../../../models/mock-data';
import { Rep } from '../../../models/outreach/intake';
import { AssignBar, AssignTarget } from '../../../ui/assign-bar';
import { Empty, fmtDay } from '../../../ui/inbound-chips';
import { useEffect, useMemo, useState } from 'react';

const PAGE_SIZE = 25;
const th = 'px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap';

export function UnassignedPool({ leads, reps, rotation, assigner, busy, rrRule, onAssign, onOpen }: {
  leads: OutreachLead[];
  reps: Rep[];
  rotation: Rep[];
  assigner: boolean;
  busy: boolean;
  rrRule: string;
  onAssign: (leads: OutreachLead[], to: AssignTarget) => Promise<boolean>;
  onOpen: (id: string) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const ids = leads.map((l) => l.id).join(',');
  useEffect(() => { setPage(0); setPicked((p) => new Set([...p].filter((id) => ids.split(',').includes(id)))); }, [ids]);

  const pages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE));
  const rows = leads.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const chosen = useMemo(() => leads.filter((l) => picked.has(l.id)), [leads, picked]);
  const allOnPage = rows.length > 0 && rows.every((l) => picked.has(l.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const togglePage = () => setPicked((p) => {
    const n = new Set(p);
    for (const l of rows) { if (allOnPage) n.delete(l.id); else n.add(l.id); }
    return n;
  });

  const assign = async (to: AssignTarget) => {
    if (await onAssign(chosen, to)) setPicked(new Set());
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-wrap"
        title="Leads from any source with no BM yet: entered by an admin as Unassigned, or rejected back by the BM they were assigned to.">
        <h3 className="text-[12px] font-bold text-gray-800">Unassigned pool</h3>
        <span className="text-[11px] font-semibold text-gray-400">{leads.length}</span>
        <span className="text-[10.5px] text-gray-400 hidden sm:inline">Any source · no BM yet</span>
        {assigner && leads.length > 0 && !picked.size && (
          <button disabled={busy || !reps.length} onClick={() => onAssign(leads, { among: rotation })}
            className="ml-auto px-2.5 py-1 text-[11px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-50">
            {busy ? 'Assigning…' : `Assign all ${leads.length} round-robin`}
          </button>
        )}
      </div>
      {assigner && <AssignBar count={picked.size} noun="lead" teams={{ outreach: { reps, rotation } }} busy={busy} rule={rrRule} onAssign={assign} onClear={() => setPicked(new Set())} />}
      {!leads.length ? <div className="py-6"><Empty>No unassigned lead. An admin can add one with + New lead and BM set to Unassigned.</Empty></div> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-gray-100 bg-gray-50/60">
                {assigner && <th className={th}><input type="checkbox" checked={allOnPage} onChange={togglePage} aria-label="Select this page" /></th>}
                {['Firm', 'Contact', 'Source', 'Segment', 'City', 'Added', 'Last rejection'].map((h) => <th key={h} className={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="border-b border-gray-50 last:border-0">
                    {assigner && <td className="px-3 py-2"><input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Select ${l.company}`} /></td>}
                    <td className="px-3 py-2 font-semibold text-gray-900 max-w-[220px] truncate cursor-pointer hover:underline" onClick={() => onOpen(l.id)}>{l.company}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.contactPerson || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      {l.source || '—'}
                      {l.ecReferral && <div className="text-[10.5px] text-gray-400">{l.ecReferral.ec} · {l.ecReferral.by}</div>}
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.segment || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.city || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDay(l.createdAt)}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-[260px]">
                      {l.intake?.rejectedAt
                        ? <span className="text-red-700">{l.intake.rejectedBy || 'BM'}: {l.intake.rejectReason}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {leads.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-3 py-3 border-t border-gray-100">
              <span className="text-[11px] text-gray-400">{`Showing ${page * PAGE_SIZE + 1}–${Math.min(leads.length, (page + 1) * PAGE_SIZE)} of ${leads.length}`}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                  className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">← Prev</button>
                <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}
                  className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">Next →</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
