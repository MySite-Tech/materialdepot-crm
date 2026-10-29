import { InboundLead, LeadNote, OutreachLead } from '../mock-data';
import { InboundStatus, sentToOutreach } from '../inbound';
import { COMPANY_TYPES, CompanyType } from '.';
import { sameRep } from './handover';
import { normalisePhone } from '@/lib/org/utils';

export const INBOUND_POOL_STAGES: InboundStatus[] = ['Closed', 'PI Shared', 'Follow up', 'Connected - Need nurturing'];

export interface Rep { name: string; phone?: string }

export interface PoolLead {
  lead: InboundLead;
  converted: boolean;
}

export const intakeLeadId = (inboundLeadId: string): string => `OR-IN-${inboundLeadId}`;

export const intakePending = (l: OutreachLead): boolean =>
  !!l.intake && !l.intake.acceptedAt && !l.intake.rejectedAt;

export function inboundPool(inbound: InboundLead[], outreach: OutreachLead[]): PoolLead[] {
  const linked = new Set(outreach.map((l) => l.intake?.inboundLeadId).filter(Boolean) as string[]);
  const phones = new Set(outreach.map((l) => normalisePhone(l.phone)).filter((p) => p.length === 10));
  return inbound
    .filter((l) => sentToOutreach(l) && INBOUND_POOL_STAGES.includes(l.stage))
    .filter((l) => !linked.has(l.id) && !phones.has(normalisePhone(l.phone)))
    .map((lead) => ({ lead, converted: lead.stage === 'Closed' }))
    .sort((a, b) => String(b.lead.outreachReferral?.at || '').localeCompare(String(a.lead.outreachReferral?.at || '')));
}

function referralBrief(l: InboundLead): string {
  const r = l.outreachReferral;
  if (!r?.at) return '';
  const slot = `${r.meetingDate}${r.meetingTime ? ` ${r.meetingTime}` : ''}`;
  return [
    `Decision maker: ${r.decisionMaker}`,
    `Project: ${r.project}`,
    `Wants to meet: ${slot}${r.meetingLocation ? ` at ${r.meetingLocation}` : ''}`,
    l.requirement ? `Requirement: ${l.requirement}` : '',
    `From ${r.by} (Inbound): ${r.summary || r.note || ''}`,
  ].filter(Boolean).join('\n');
}

export function inboundContext(l: InboundLead): LeadNote[] {
  const calls = (l.callAttempts || []).map((a): LeadNote => ({
    ts: a.at,
    author: `${a.by || 'Inbound'} (Inbound call)`,
    text: a.outcome === 'Connected'
      ? `Connected${a.durationMin ? `, ${a.durationMin} min` : ''}: ${a.note || ''}`.trim()
      : 'RNR — no answer',
  }));
  const notes = (l.notes || []).map((n): LeadNote => ({ ...n, author: `${n.author || 'Inbound'} (Inbound note)` }));
  return [...calls, ...notes].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}

export function leadFromInbound(l: InboundLead, rep: Rep, by: string, at: string, accepted: boolean): OutreachLead {
  return {
    id: intakeLeadId(l.id),
    company: String(l.companyName || l.company || l.contactName || '').trim() || 'Unnamed lead',
    contactPerson: l.primaryContactName || l.contactName || '',
    phone: l.primaryContactPhone || l.phone || undefined,
    altPhone: l.primaryContactPhone && l.phone && l.primaryContactPhone !== l.phone ? l.phone : undefined,
    altName: l.primaryContactPhone && l.phone && l.primaryContactPhone !== l.phone ? l.contactName || undefined : undefined,
    contacts: (l.additionalContacts || []).filter((c) => c.name || c.phone).map((c) => ({ name: c.name, role: '', phone: c.phone || undefined })),
    gstNumber: l.gstNumber || undefined,
    segment: l.segment,
    leadType: l.leadType,
    companyType: companyTypeFrom(l.clientType),
    city: l.location,
    selections: l.selections || [],
    requirement: referralBrief(l) || l.requirement || l.leadSummary || undefined,
    officeAddress: l.officeLocation || undefined,
    expectedOrderValue: l.expectedOrderValue,
    bm: rep.name,
    bmPhone: rep.phone,
    source: 'Inbound',
    createdAt: at,
    status: 'Yet to Meet',
    statusChangedAt: at,
    meetings: [],
    notes: inboundContext(l),
    spok: rep.name,
    value: 0,
    intake: {
      from: 'Inbound',
      inboundLeadId: l.id,
      inboundOwner: l.owner || undefined,
      inboundStage: l.stage,
      assignedAt: at,
      assignedBy: by,
      acceptedAt: accepted ? at : undefined,
    },
  };
}

export function planRoundRobin<T>(items: T[], reps: Rep[], current: OutreachLead[], month: string): { item: T; rep: Rep }[] {
  if (!reps.length) return [];
  const load = new Map(reps.map((r) => [r.name, 0]));
  for (const l of current) {
    if (!l.intake || String(l.intake.assignedAt).slice(0, 7) !== month) continue;
    const rep = reps.find((r) => sameRep(r.name, l.bm));
    if (rep) load.set(rep.name, (load.get(rep.name) || 0) + 1);
  }
  return items.map((item) => {
    const rep = [...reps].sort((a, b) => (load.get(a.name)! - load.get(b.name)!) || a.name.localeCompare(b.name))[0];
    load.set(rep.name, load.get(rep.name)! + 1);
    return { item, rep };
  });
}

function companyTypeFrom(raw: string | undefined): CompanyType | undefined {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return undefined;
  const hit = COMPANY_TYPES.find((t) => t.toLowerCase() === v);
  if (hit) return hit;
  if (v.startsWith('architect')) return 'Architect';
  if (v.startsWith('interior') || v === 'id') return 'Interior Designer';
  if (v.startsWith('contract')) return 'Contractor';
  if (v.startsWith('build')) return 'Builder';
  return 'Other';
}

export const INTAKE_REJECT_REASONS = [
  'Phone not reachable or wrong',
  'Not the decision maker',
  'No active or upcoming project',
  'Location not serviceable',
  'Not interested in a meeting',
  'Duplicate of an existing lead',
] as const;

export function rejectIntake(l: OutreachLead, reason: string, at: string): OutreachLead {
  if (!l.intake) return l;
  return {
    ...l,
    status: 'Lost',
    lostReason: `Rejected from Inbound — ${reason}`,
    intake: { ...l.intake, rejectedAt: at, rejectReason: reason },
  };
}
