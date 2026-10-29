'use client';

import { OutreachLead } from '../../../models/mock-data';
import { JourneyEvent, WaitlistSignup } from '../../../models/outreach';
import { Empty, SectionCard } from '../../../ui/inbound-chips';
import { useMemo } from 'react';

const DOT: Partial<Record<JourneyEvent['kind'] | 'waitlist', string>> = {
  'meeting-held': '#22C55E',
  'order-verified': '#22C55E',
  'handover-accepted': '#22C55E',
  'meeting-postponed': '#F59E0B',
  'intake-rejected': '#EF4444',
  'handover-rejected': '#EF4444',
  waitlist: '#8B5CF6',
};

const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

export function OutreachJourneyCard({ lead, waitlist }: { lead: OutreachLead; waitlist: WaitlistSignup | null | undefined }) {
  const events = useMemo(() => {
    const list: (JourneyEvent | { at: string; by: string; kind: 'waitlist'; text: string })[] = [...(lead.journey || [])];
    if (waitlist) list.push({ at: waitlist.createdAt, by: waitlist.contactName, kind: 'waitlist', text: `Joined the Studio Space waitlist as ${waitlist.firmName}` });
    return list.sort((a, b) => b.at.localeCompare(a.at));
  }, [lead.journey, waitlist]);

  return (
    <SectionCard title="Journey" owner="derived" subtitle="Every step logged as it happens, newest first">
      {!events.length ? (
        <Empty>Nothing logged yet. Steps are recorded from the next save on; earlier history is in the meetings and notes above.</Empty>
      ) : (
        <ol className="relative border-l border-gray-200 ml-1.5">
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`} className="ml-3.5 pb-2.5 last:pb-0">
              <span className="absolute -left-[4.5px] mt-1.5 w-2 h-2 rounded-full" style={{ background: DOT[e.kind] || '#9CA3AF' }} />
              <div className="text-[12px] text-gray-800 leading-snug">{e.text}</div>
              <div className="text-[10px] text-gray-400">{`${fmt(e.at)} · ${e.by}`}</div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
