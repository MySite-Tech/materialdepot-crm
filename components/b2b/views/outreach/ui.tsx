'use client';

import { OutreachLead, fmtINR } from '../../models/mock-data';
import { companyTypeLabel, meetingsExhausted, nextScheduledMeeting } from '../../models/outreach';
import { FollowUpChip, fmtDay } from '../../ui/inbound-chips';
import { MeetingProgress, OutreachLeadTypeChip } from '../../ui/outreach-chips';
import { gapsFor } from './utils';

export function Tile({ label, value, sub, accent, muted }: {
  label: string; value: string; sub?: string; accent?: string; muted?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-3.5 py-3 min-w-0">
      <div className="flex items-center gap-1.5">
        {accent && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} />}
        <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 truncate">{label}</div>
      </div>
      <div className={`text-[22px] font-bold leading-tight mt-1 ${muted ? 'text-gray-300' : 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

export function LeadCard({ lead, today, onClick, onDragStart }: {
  lead: OutreachLead; today: string; onClick: () => void; onDragStart: () => void;
}) {
  const gaps = gapsFor(lead);
  const next = nextScheduledMeeting(lead.meetings);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-2.5 hover:border-[#0F766E] hover:shadow-sm transition-all cursor-pointer active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="text-[12.5px] font-semibold text-gray-900 leading-tight min-w-0 truncate">{lead.company}</div>
        <OutreachLeadTypeChip t={lead.leadType} />
      </div>
      <div className="text-[10.5px] text-gray-400 mt-0.5 truncate">
        {[lead.contactPerson, lead.designation].filter(Boolean).join(' · ') || '—'}
      </div>
      {lead.companyType && (
        <div className="text-[10px] text-gray-500 mt-1">{companyTypeLabel(lead.companyType, lead.companyTypeOther)}</div>
      )}
      {next && (
        <div className="text-[10.5px] text-[#0F766E] mt-1.5">
          Next: {fmtDay(next.date)}{next.time ? ` · ${next.time}` : ''}
        </div>
      )}
      {(lead.status === 'Follow up' || lead.status === 'PI Shared') && (
        <div className="mt-1.5"><FollowUpChip date={lead.followUpDate} today={today} /></div>
      )}
      {(lead.status === 'PI Shared' || lead.status === 'Closed') && !!lead.orderValue && (
        <div className="text-[11px] font-mono font-semibold text-gray-700 mt-1.5">{fmtINR(lead.orderValue)}</div>
      )}
      {lead.status === 'Quote Share' && !!lead.expectedOrderValue && (
        <div className="text-[11px] font-mono text-gray-500 mt-1.5" title="The BM's estimate, not a quoted figure">
          ~{fmtINR(lead.expectedOrderValue)}
        </div>
      )}
      {lead.status === 'Lost' && (
        <div className="text-[10.5px] text-red-500 mt-1.5 leading-snug">
          {lead.lostReason || <span className="text-amber-600">No reason recorded</span>}
        </div>
      )}
      {lead.status === 'Closed' && (
        <div className="text-[10.5px] text-gray-500 mt-1.5 leading-snug">
          {lead.kam ? `KAM: ${lead.kam}` : <span className="text-amber-600">No KAM assigned</span>}
        </div>
      )}
      {meetingsExhausted(lead.meetings) && (
        <div className="text-[10px] text-amber-700 mt-1.5 leading-snug">All 4 meetings postponed — decide Lost or park</div>
      )}
      <div className="flex items-center justify-between gap-1.5 mt-2 pt-2 border-t border-gray-50">
        <MeetingProgress meetings={lead.meetings} />
        {gaps.length > 0 && (
          <span title={`Missing: ${gaps.map((g) => g.label).join(', ')}`} className="text-[10px] font-semibold text-amber-600 whitespace-nowrap">
            ⚠ {gaps.length}
          </span>
        )}
      </div>
    </div>
  );
}
