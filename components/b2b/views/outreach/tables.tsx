'use client';

import { OutreachLead, fmtINR } from '../../models/mockData';
import { FollowUpBucket, OutreachStatus, companyTypeLabel, followUpBucket, meetingLocation } from '../../models/outreachModel';
import { Empty, EnrichmentBadge, fmtDay } from '../../ui/inboundChips';
import { MeetingProgress, OutreachStatusBadge } from '../../ui/outreachChips';
import { BUCKET_NOTE, BUCKET_ORDER, BUCKET_TITLE } from '../../constants/outreach-leads';
import { gapsFor } from '../../utils/outreach-leads';
import { useMemo } from 'react';

export function TodayTable({ leads, today, onOpen }: {
  leads: OutreachLead[]; today: string; onOpen: (id: string) => void;
}) {
  const rows = useMemo(() => leads
    .map((l) => ({ lead: l, meeting: (l.meetings || []).find((m) => m.status === 'Scheduled' && String(m.date || '').slice(0, 10) === today)! }))
    .filter((r) => !!r.meeting)
    .sort((a, b) => (a.meeting.time || '99:99').localeCompare(b.meeting.time || '99:99')),
  [leads, today]);

  if (!rows.length) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 py-10">
        <Empty>No meetings scheduled for today in this filter.</Empty>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-baseline gap-2">
        <h3 className="text-[12px] font-bold text-gray-800">Meetings today</h3>
        <span className="text-[11px] font-semibold text-gray-400">{rows.length}</span>
        <span className="text-[10px] text-gray-400 hidden sm:inline">Soonest first. Mark each Completed or Postponed in the lead.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              {['Time', 'Company', 'Contact', 'Type', 'Meeting', 'Location', 'Status', 'BM', ''].map((h, i) => (
                <th key={i} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ lead: l, meeting: m }) => {
              const gaps = gapsFor(l);
              return (
                <tr key={l.id} onClick={() => onOpen(l.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                  <td className="px-3 py-2 font-mono font-semibold text-gray-800 whitespace-nowrap">{m.time || '—'}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 max-w-[220px] truncate">{l.company}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {l.contactPerson || '—'}
                    {l.phone && <span className="font-mono text-gray-400"> · {l.phone}</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{companyTypeLabel(l.companyType, l.companyTypeOther) || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">#{m.n} of 4</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate">{meetingLocation(m) || '—'}</td>
                  <td className="px-3 py-2"><OutreachStatusBadge s={l.status} /></td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.bm}</td>
                  <td className="px-3 py-2">{gaps.length > 0 && <EnrichmentBadge gaps={gaps.map((g) => g.label)} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FollowUpTable({ leads, today, onOpen }: {
  leads: OutreachLead[]; today: string; onOpen: (id: string) => void;
}) {
  const grouped = useMemo(() => {
    const g: Record<FollowUpBucket, OutreachLead[]> = { overdue: [], today: [], upcoming: [], none: [] };
    for (const l of leads) g[followUpBucket(l.followUpDate, today)].push(l);
    for (const k of BUCKET_ORDER) {
      g[k].sort((a, b) => {
        const d = (a.followUpDate || '').localeCompare(b.followUpDate || '');
        if (d !== 0) return k === 'upcoming' ? d : -d;
        return (a.followUpTime || '').localeCompare(b.followUpTime || '');
      });
    }
    return g;
  }, [leads, today]);

  if (!BUCKET_ORDER.some((k) => grouped[k].length > 0)) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 py-10">
        <Empty>No leads on follow-up in this filter.</Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {BUCKET_ORDER.map((bucket) => {
        const rows = grouped[bucket];
        if (!rows.length) return null;
        return (
          <div key={bucket} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-baseline gap-2 px-4 py-2.5 border-b border-gray-100 min-w-0">
              <h3 className="text-[12px] font-bold text-gray-800 whitespace-nowrap">{BUCKET_TITLE[bucket]}</h3>
              <span className="text-[11px] font-semibold text-gray-400">{rows.length}</span>
              <span className="text-[10px] text-gray-400 truncate hidden sm:inline">{BUCKET_NOTE[bucket]}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    {['Company', 'Contact', 'Type', 'Status', 'Meetings', 'Follow-up', 'BM', 'Value', ''].map((h, i) => (
                      <th key={i} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => {
                    const gaps = gapsFor(l);
                    return (
                      <tr key={l.id} onClick={() => onOpen(l.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                        <td className="px-3 py-2 font-semibold text-gray-900 max-w-[220px] truncate">{l.company}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.contactPerson || '—'}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{companyTypeLabel(l.companyType, l.companyTypeOther) || '—'}</td>
                        <td className="px-3 py-2"><OutreachStatusBadge s={l.status} /></td>
                        <td className="px-3 py-2"><MeetingProgress meetings={l.meetings} /></td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {l.followUpDate
                            ? <span className="text-gray-600">{fmtDay(l.followUpDate)}{l.followUpTime ? ` · ${l.followUpTime}` : ''}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.bm}</td>
                        <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">
                          {l.orderValue ? fmtINR(l.orderValue)
                            : l.expectedOrderValue ? <span className="text-gray-400" title="The BM's estimate">~{fmtINR(l.expectedOrderValue)}</span>
                              : '—'}
                        </td>
                        <td className="px-3 py-2">{gaps.length > 0 && <EnrichmentBadge gaps={gaps.map((g) => g.label)} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StatusTable({ status, leads, onOpen }: {
  status: OutreachStatus; leads: OutreachLead[]; onOpen: (id: string) => void;
}) {
  if (!leads.length) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 py-10">
        <Empty>No {status} leads in this filter.</Empty>
      </div>
    );
  }
  const showValue = status !== 'Lost';
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              {['Company', 'Contact', 'Type', 'Enq ID', showValue ? 'Order value' : 'Lost reason',
                status === 'Closed' ? 'KAM' : 'Follow-up', 'Expected closure', 'BM'].map((h, i) => (
                <th key={i} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} onClick={() => onOpen(l.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                <td className="px-3 py-2 font-semibold text-gray-900 max-w-[220px] truncate">{l.company}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.contactPerson || '—'}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{companyTypeLabel(l.companyType, l.companyTypeOther) || '—'}</td>
                <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{l.enqId || <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {showValue
                    ? (l.orderValue
                      ? <span className="font-mono text-gray-700">{fmtINR(l.orderValue)}</span>
                      : <span className="text-amber-600 text-[11px]">not fetched</span>)
                    : (l.lostReason || <span className="text-amber-600 text-[11px]">No reason recorded</span>)}
                </td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                  {status === 'Closed'
                    ? (l.kam || <span className="text-amber-600 text-[11px]">Unassigned</span>)
                    : (l.followUpDate ? fmtDay(l.followUpDate) : '—')}
                </td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.expectedClosure ? fmtDay(l.expectedClosure) : '—'}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.bm}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
