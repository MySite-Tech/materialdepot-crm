'use client';

import { fmtDate, fmtPhone } from '../utils';
import { OutreachLead, fmtShortINR } from '../../../models/mock-data';
import { companyTypeLabel, heldMeetings } from '../../../models/outreach';
import { isWhatsappGroupLink, whatsappDeclineReason } from '../../../models/outreach/handover';
import { SectionCard } from '../../../ui/inbound-chips';

const NOTES_SHOWN = 3;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11.5px] font-medium text-gray-500">{label}</div>
      <div className="text-[12.5px] text-gray-800 break-words">{children || <span className="text-gray-400">Not given</span>}</div>
    </div>
  );
}

export function HandoverCard({ lead, failed }: { lead?: OutreachLead; failed: boolean }) {
  if (failed) {
    return (
      <SectionCard title="Handover from Outreach">
        <p className="text-[11px] text-blue-700">The Outreach leads could not be read, so whether this firm came with a handover is unknown.</p>
      </SectionCard>
    );
  }
  const h = lead?.handover;
  if (!lead || !h) return null;

  const link = isWhatsappGroupLink(lead.whatsappGroupLink) ? String(lead.whatsappGroupLink).trim()
    : isWhatsappGroupLink(h.whatsappGroupLink) ? String(h.whatsappGroupLink).trim() : undefined;
  const declined = link ? undefined : whatsappDeclineReason(lead) || h.whatsappGroupDeclined;
  const people = [
    { name: lead.contactPerson, role: lead.designation, phone: lead.phone },
    { name: lead.altName, role: lead.altRole, phone: lead.altPhone },
    ...(lead.contacts || []),
  ].filter((p) => String(p.name || '').trim() || String(p.phone || '').trim());
  const meetings = heldMeetings(lead.meetings);
  const notes = (lead.notes || []).slice(-NOTES_SHOWN).reverse();
  const sent = `Sent by ${h.sentBy || lead.bm} to ${h.kam} on ${fmtDate(h.sentAt)}`;
  const answered = h.status === 'Accepted'
    ? `signed off by ${h.respondedBy || h.kam}${h.respondedAt ? ` on ${fmtDate(h.respondedAt)}` : ''}`
    : `waiting for ${h.kam}'s sign-off`;

  return (
    <SectionCard title="Handover from Outreach" subtitle={`${sent} · ${answered}`}>
      <div className="rounded-md border border-gray-200 px-3 py-2 mb-3 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11.5px] font-medium text-gray-500">WhatsApp group</span>
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-[#0F766E] hover:underline break-all">{link}</a>
        ) : declined ? (
          <span className="text-[12px] text-amber-700">{`No group: client not willing (${declined})`}</span>
        ) : (
          <span className="text-[12px] text-gray-400">Not given</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Row label="Office address">{lead.officeAddress}</Row>
        <Row label="City">{lead.city}</Row>
        <Row label="Outreach BM">{lead.bm}</Row>
        <Row label="Client type">{companyTypeLabel(lead.companyType, lead.companyTypeOther)}</Row>
        <Row label="Segment">{lead.segment}</Row>
        <Row label="Team size">{lead.teamSize}</Row>
        <Row label="Email">{lead.email}</Row>
        <Row label="GST">{lead.gstNumber}</Row>
        <Row label="First order">{lead.enqId ? `${lead.enqId}${lead.orderValue ? ` · ${fmtShortINR(lead.orderValue)}` : ''}` : undefined}</Row>
      </div>

      <div className="mt-3">
        <Row label="Project details">{lead.requirement ? <span className="whitespace-pre-line">{lead.requirement}</span> : undefined}</Row>
      </div>

      <div className="mt-3">
        <div className="text-[11.5px] font-medium text-gray-500">People the BM met</div>
        {people.length ? (
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {people.map((p, i) => (
              <li key={`${p.phone || ''}-${i}`} className="text-[12.5px] text-gray-800">
                {[p.name, p.role, p.phone ? fmtPhone(p.phone) : ''].filter((v) => String(v || '').trim()).join(' · ')}
              </li>
            ))}
          </ul>
        ) : <p className="text-[12px] text-gray-400">Not given</p>}
      </div>

      <div className="mt-3">
        <div className="text-[11.5px] font-medium text-gray-500">{`Meetings held (${meetings.length})`}</div>
        {meetings.length ? (
          <ul className="mt-1 flex flex-col gap-1.5">
            {meetings.map((m) => (
              <li key={m.n} className="border-l-2 border-teal-200 pl-2">
                <div className="text-[11px] text-gray-500">
                  {[`Meeting ${m.n}`, m.date ? fmtDate(m.date) : '', m.metWith ? `met ${m.metWith}` : '', m.officeLocation || m.area || ''].filter(Boolean).join(' · ')}
                </div>
                {m.notes && <div className="text-[12px] text-gray-800 whitespace-pre-line">{m.notes}</div>}
              </li>
            ))}
          </ul>
        ) : <p className="text-[12px] text-gray-400">None marked held</p>}
      </div>

      {!!notes.length && (
        <div className="mt-3">
          <div className="text-[11.5px] font-medium text-gray-500">{`Latest Outreach notes (${notes.length} of ${lead.notes?.length})`}</div>
          <ul className="mt-1 flex flex-col gap-1">
            {notes.map((n) => (
              <li key={`${n.ts}-${n.author}-${n.text.length}`} className="text-[12px] text-gray-800">
                <span className="text-[11px] text-gray-500">{`${n.ts} · ${n.author}: `}</span>{n.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
