import { InboundLead, LeadNote, OutreachLead } from '../mock-data';
import { InboundStatus, sentToOutreach } from '../inbound';
import { AssignHow, COMPANY_TYPES, CompanyType, EC_B2B_REFERRAL } from '.';
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
    r.project ? `Project: ${r.project}` : '',
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

export function leadFromInbound(l: InboundLead, rep: Rep, by: string, at: string, how: AssignHow): OutreachLead {
  return {
    id: intakeLeadId(l.id),
    company: String(l.companyName || l.company || l.contactName || '').trim() || 'Unnamed lead',
    contactPerson: l.primaryContactName || l.contactName || '',
    designation: l.primaryContactRole || undefined,
    phone: l.primaryContactPhone || l.phone || undefined,
    altPhone: l.primaryContactPhone && l.phone && l.primaryContactPhone !== l.phone ? l.phone : undefined,
    altName: l.primaryContactPhone && l.phone && l.primaryContactPhone !== l.phone ? l.contactName || undefined : undefined,
    contacts: (l.additionalContacts || []).filter((c) => c.name || c.phone).map((c) => ({ name: c.name, role: c.role || '', phone: c.phone || undefined })),
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
      how,
      acceptedAt: how === 'self' ? at : undefined,
    },
  };
}

export interface EcReferralInput {
  company: string;
  contactPerson: string;
  phone: string;
  companyType: CompanyType;
  designation?: string;
  city?: string;
  requirement?: string;
  ec: string;
}

export function leadFromEcReferral(f: EcReferralInput, by: Rep, id: string, at: string): OutreachLead {
  return {
    id,
    company: f.company,
    contactPerson: f.contactPerson,
    designation: f.designation,
    phone: f.phone,
    companyType: f.companyType,
    city: f.city,
    selections: [],
    requirement: [`Referred by ${by.name} at ${f.ec}`, f.requirement ? `Requirement: ${f.requirement}` : ''].filter(Boolean).join('\n'),
    bm: '',
    source: EC_B2B_REFERRAL,
    ecReferral: { ec: f.ec, by: by.name, byPhone: by.phone || '', at },
    ecName: f.ec,
    ecBmName: by.name,
    createdAt: at,
    status: 'Yet to Meet',
    statusChangedAt: at,
    meetings: [],
    notes: [],
    value: 0,
  };
}

export function spreadByLoad<T>(items: T[], reps: Rep[], load: Map<string, number>): { item: T; rep: Rep }[] {
  if (!reps.length) return [];
  const held = new Map(reps.map((r) => [r.name, load.get(r.name) || 0]));
  return items.map((item) => {
    const rep = [...reps].sort((a, b) => (held.get(a.name)! - held.get(b.name)!) || a.name.localeCompare(b.name))[0];
    held.set(rep.name, held.get(rep.name)! + 1);
    return { item, rep };
  });
}

export function planRoundRobin<T>(items: T[], reps: Rep[], current: OutreachLead[], month: string): { item: T; rep: Rep }[] {
  const load = new Map<string, number>();
  for (const l of current) {
    if (!l.intake || String(l.intake.assignedAt).slice(0, 7) !== month) continue;
    const rep = reps.find((r) => sameRep(r.name, l.bm));
    if (rep) load.set(rep.name, (load.get(rep.name) || 0) + 1);
  }
  return spreadByLoad(items, reps, load);
}

export const isUnassigned = (l: OutreachLead): boolean => !String(l.bm || '').trim();

export const unassignedPool = (leads: OutreachLead[]): OutreachLead[] =>
  leads
    .filter((l) => isUnassigned(l) && l.status !== 'Lost')
    .sort((a, b) => String(b.intake?.rejectedAt || b.createdAt || '').localeCompare(String(a.intake?.rejectedAt || a.createdAt || '')));

export function assignLead(l: OutreachLead, rep: Rep, by: string, at: string, how: AssignHow): OutreachLead {
  return {
    ...l,
    bm: rep.name,
    bmPhone: rep.phone,
    spok: rep.name,
    intake: {
      from: l.intake?.from || l.source || 'Own research',
      inboundLeadId: l.intake?.inboundLeadId,
      inboundOwner: l.intake?.inboundOwner,
      inboundStage: l.intake?.inboundStage,
      assignedAt: at,
      assignedBy: by,
      how,
      acceptedAt: how === 'self' ? at : undefined,
    },
  };
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

export const ASSIGN_REJECT_REASONS = [...INTAKE_REJECT_REASONS, 'Outside my area'] as const;

export function rejectIntake(l: OutreachLead, reason: string, at: string, by: string): OutreachLead {
  if (!l.intake) return l;
  const intake = { ...l.intake, rejectedAt: at, rejectReason: reason, rejectedBy: by };
  if (l.intake.from !== 'Inbound') return { ...l, bm: '', bmPhone: undefined, spok: '', intake };
  return { ...l, status: 'Lost', lostReason: `Rejected from Inbound — ${reason}`, intake };
}
