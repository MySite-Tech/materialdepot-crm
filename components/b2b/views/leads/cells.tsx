'use client';

import { Pill, fmtDay } from '../../ui/inbound-chips';
import { EC_B2B_REFERRAL } from '../../models/outreach';
import { SOURCE_COLORS, STATUS_COLORS } from './constants';
import { UnifiedLead } from '@/lib/b2b';

export function SourceChip({ lead }: { lead: UnifiedLead }) {
  const s = lead.outreach?.source === EC_B2B_REFERRAL ? EC_B2B_REFERRAL : lead.source;
  return <Pill color={SOURCE_COLORS[s]}>{s}</Pill>;
}

export function ReferralEcCell({ lead }: { lead: UnifiedLead }) {
  const o = lead.outreach;
  const ec = o?.ecReferral?.ec || (o?.source === EC_B2B_REFERRAL ? o.ecName : undefined);
  return ec ? <>{ec}</> : <span className="text-gray-300">—</span>;
}

export function ReferrerCell({ lead }: { lead: UnifiedLead }) {
  const r = lead.outreach?.ecReferral;
  if (!r?.by) return <span className="text-gray-300">—</span>;
  return (
    <>
      <div>{r.by}</div>
      {r.byPhone && <div className="text-[10.5px] text-gray-400 font-mono">{r.byPhone}</div>}
    </>
  );
}

export function UnifiedStatusCell({ lead }: { lead: UnifiedLead }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Pill color={STATUS_COLORS[lead.status]}>{lead.status}</Pill>
      {lead.lost && <Pill color="#EF4444" title={lead.outreach?.lostReason || lead.inbound?.lostReason || 'No reason recorded'}>Lost</Pill>}
    </span>
  );
}

export function ExpectedClosureCell({ lead }: { lead: UnifiedLead }) {
  if (!lead.hasExpectedClosureField) {
    return (
      <span
        className="text-gray-300 text-[11px]"
        title="Inbound leads have no expected-closure field — the Kylas value is auto-stamped junk and is deliberately unmapped. This is not a gap the Inbound team can fill."
      >
        n/a
      </span>
    );
  }
  return lead.expectedClosure
    ? <span className="text-gray-600">{fmtDay(lead.expectedClosure)}</span>
    : <span className="text-gray-300" title="No expected closure date entered">—</span>;
}
