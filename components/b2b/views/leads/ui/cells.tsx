'use client';

import { Pill, fmtDay } from '../../../ui/inbound-chips';
import { EC_B2B_REFERRAL } from '../../../models/outreach';
import { SOURCE_COLORS, STATES } from '../constants';
import { leadState } from '../utils';
import { UnifiedLead } from '@/lib/b2b';

export function SourceChip({ lead }: { lead: UnifiedLead }) {
  const s = lead.outreach?.source === EC_B2B_REFERRAL ? EC_B2B_REFERRAL : lead.source;
  return <Pill color={SOURCE_COLORS[s]}>{s}</Pill>;
}

export function SourceCell({ lead }: { lead: UnifiedLead }) {
  const sub = lead.source === 'Outreach' ? lead.outreach?.source : undefined;
  return (
    <>
      <div className="flex items-center gap-1.5 text-gray-800">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: SOURCE_COLORS[lead.source] }} />
        {lead.source}
      </div>
      {sub && <div className="text-[12px] text-gray-500 pl-3 truncate max-w-[160px]">{sub}</div>}
    </>
  );
}

export function UnifiedStatusCell({ lead }: { lead: UnifiedLead }) {
  const s = STATES.find((x) => x.key === leadState(lead))!;
  const reason = lead.outreach?.lostReason || lead.inbound?.lostReason;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-800" title={s.key === 'lost' ? reason || 'No reason recorded' : undefined}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

export function StageCell({ lead }: { lead: UnifiedLead }) {
  return <span className="text-gray-600 whitespace-nowrap">{lead.sourceStatus || '—'}</span>;
}

export function ReferrerCell({ lead }: { lead: UnifiedLead }) {
  const r = lead.outreach?.ecReferral;
  if (!r?.by) return <span className="text-gray-300">—</span>;
  return (
    <>
      <div className="text-gray-800">{r.by}</div>
      {r.byPhone && <div className="text-[12px] text-gray-500 tabular-nums">{r.byPhone}</div>}
    </>
  );
}

export function ExpectedClosureCell({ lead }: { lead: UnifiedLead }) {
  if (!lead.hasExpectedClosureField) {
    return (
      <span className="text-gray-300" title="Inbound leads have no expected-closure field, so this is not a gap the Inbound team can fill">
        n/a
      </span>
    );
  }
  return lead.expectedClosure
    ? <span className="text-gray-700 tabular-nums">{fmtDay(lead.expectedClosure)}</span>
    : <span className="text-gray-300" title="No expected closure date entered">—</span>;
}
