import { InboundLead, OutreachLead } from '../mock-data';
import { InboundStatus } from '../inbound';
import { newB2BId } from '../ids';
import {
  COMPANY_TYPES, CompanyType, OUTREACH_SOURCES, OutreachSource, SEGMENTS, Segment, TEAM_SIZES, TeamSize,
} from '.';
import { isMobile, sameRep } from './handover';
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
  const rank = (s: InboundStatus) => INBOUND_POOL_STAGES.indexOf(s);
  return inbound
    .filter((l) => INBOUND_POOL_STAGES.includes(l.stage))
    .filter((l) => !linked.has(l.id) && !phones.has(normalisePhone(l.phone)))
    .map((lead) => ({ lead, converted: lead.stage === 'Closed' }))
    .sort((a, b) => rank(a.lead.stage) - rank(b.lead.stage)
      || String(b.lead.leadCreatedAt || '').localeCompare(String(a.lead.leadCreatedAt || '')));
}

export function leadFromInbound(l: InboundLead, rep: Rep, by: string, at: string, accepted: boolean): OutreachLead {
  return {
    id: intakeLeadId(l.id),
    company: String(l.companyName || l.company || l.contactName || '').trim() || 'Unnamed lead',
    contactPerson: l.contactName || '',
    phone: l.phone || undefined,
    gstNumber: l.gstNumber || undefined,
    segment: l.segment,
    leadType: l.leadType,
    companyType: companyTypeFrom(l.clientType),
    city: l.location,
    selections: l.selections || [],
    requirement: l.requirement || l.leadSummary || undefined,
    expectedOrderValue: l.expectedOrderValue,
    bm: rep.name,
    bmPhone: rep.phone,
    source: 'Inbound',
    createdAt: at,
    status: 'Yet to Meet',
    statusChangedAt: at,
    meetings: [],
    notes: [],
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

type CsvKey =
  | 'company' | 'contactPerson' | 'designation' | 'phone' | 'email' | 'gstNumber' | 'city'
  | 'officeAddress' | 'companyType' | 'segment' | 'teamSize' | 'source' | 'bm' | 'note';

export const CSV_COLUMNS: { key: CsvKey; header: string; required?: boolean; aliases: string[] }[] = [
  { key: 'company',       header: 'Firm name',      required: true, aliases: ['company', 'company name', 'firm', 'studio', 'studio name', 'business name'] },
  { key: 'contactPerson', header: 'Owner / designer name', aliases: ['contact', 'contact person', 'contact name', 'owner', 'owner name', 'designer', 'name'] },
  { key: 'designation',   header: 'Designation',    aliases: ['role', 'title'] },
  { key: 'phone',         header: 'Mobile',         required: true, aliases: ['phone', 'phone number', 'contact number', 'mobile number', 'whatsapp', 'number'] },
  { key: 'email',         header: 'Email',          aliases: ['email id', 'mail'] },
  { key: 'gstNumber',     header: 'GST',            aliases: ['gstin', 'gst number', 'gst no'] },
  { key: 'city',          header: 'City',           aliases: ['location'] },
  { key: 'officeAddress', header: 'Office address', aliases: ['address', 'office'] },
  { key: 'companyType',   header: 'Client type',    aliases: ['company type', 'type', 'firm type', 'category'] },
  { key: 'segment',       header: 'Segment',        aliases: [] },
  { key: 'teamSize',      header: 'Team size',      aliases: ['team', 'employees', 'size'] },
  { key: 'source',        header: 'Source',         aliases: ['lead source', 'channel'] },
  { key: 'bm',            header: 'BM',             aliases: ['owner bm', 'assigned to', 'assignee'] },
  { key: 'note',          header: 'Notes',          aliases: ['note', 'remarks', 'comment', 'comments'] },
];

export const CSV_MAX_ROWS = 500;

const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function mapCsvHeaders(headers: string[]): { map: Map<number, CsvKey>; unknown: string[] } {
  const map = new Map<number, CsvKey>();
  const unknown: string[] = [];
  headers.forEach((h, i) => {
    const k = headerKey(h);
    const col = CSV_COLUMNS.find((c) => headerKey(c.header) === k || headerKey(c.key) === k || c.aliases.includes(k));
    if (col && ![...map.values()].includes(col.key)) map.set(i, col.key);
    else if (k) unknown.push(h);
  });
  return { map, unknown };
}

export interface ImportRow {
  line: number;
  company: string;
  phone: string;
  lead: OutreachLead | null;
  errors: string[];
  warnings: string[];
}

export function teamSizeFrom(raw: string): TeamSize | undefined {
  const v = raw.replace(/\s+/g, '').replace(/–|—|to/gi, '-');
  if ((TEAM_SIZES as readonly string[]).includes(v)) return v as TeamSize;
  const n = Number(v.replace(/\+$/, ''));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (n <= 1) return '1';
  if (n <= 5) return '2-5';
  if (n <= 15) return '6-15';
  if (n <= 50) return '16-50';
  return '50+';
}

export function planImport(
  rows: string[][],
  ctx: { existing: OutreachLead[]; inbound: InboundLead[]; reps: Rep[]; defaultRep: Rep; by: string; at: string },
): { rows: ImportRow[]; unknownHeaders: string[]; missingRequired: string[]; overLimit: number } {
  const [headers = [], ...body] = rows;
  const { map, unknown } = mapCsvHeaders(headers);
  const present = new Set(map.values());
  const missingRequired = CSV_COLUMNS.filter((c) => c.required && !present.has(c.key)).map((c) => c.header);
  if (missingRequired.length) return { rows: [], unknownHeaders: unknown, missingRequired, overLimit: 0 };
  const filled = body.filter((cells) => cells.some((c) => String(c ?? '').trim()));
  const overLimit = Math.max(0, filled.length - CSV_MAX_ROWS);

  const outreachByPhone = new Map(ctx.existing.map((l) => [normalisePhone(l.phone), l] as const).filter(([p]) => p.length === 10));
  const inboundByPhone = new Map(ctx.inbound.map((l) => [normalisePhone(l.phone), l] as const).filter(([p]) => p.length === 10));
  const seen = new Map<string, number>();

  const out: ImportRow[] = [];
  body.forEach((cells, i) => {
    if (cells.every((c) => !String(c ?? '').trim())) return;
    if (out.length >= CSV_MAX_ROWS) return;
    const line = i + 2;
    const v: Partial<Record<CsvKey, string>> = {};
    map.forEach((key, idx) => { v[key] = String(cells[idx] ?? '').trim(); });

    const errors: string[] = [];
    const warnings: string[] = [];
    const company = v.company || '';
    const phone = normalisePhone(v.phone);
    if (!company) errors.push('Firm name is empty');
    if (!isMobile(phone)) errors.push(v.phone ? `"${v.phone}" is not a 10-digit mobile` : 'Mobile is empty');

    const dupLine = seen.get(phone);
    if (phone && dupLine) errors.push(`Same mobile as line ${dupLine} of this file`);
    else if (phone) seen.set(phone, line);
    const existing = outreachByPhone.get(phone);
    if (existing) errors.push(`Already in Outreach as ${existing.company} (${existing.bm})`);
    const inb = inboundByPhone.get(phone);
    if (inb && !existing) warnings.push(`Also an Inbound lead, owned by ${inb.owner || 'nobody'}`);

    let segment: Segment | undefined;
    if (v.segment) {
      const s = v.segment.replace(/^segment\s*/i, '');
      if ((SEGMENTS as readonly string[]).includes(s)) segment = s as Segment;
      else warnings.push(`Segment "${v.segment}" is not 1, 2 or 3 — left empty`);
    }
    const companyType = companyTypeFrom(v.companyType);
    const teamSize = v.teamSize ? teamSizeFrom(v.teamSize) : undefined;
    if (v.teamSize && !teamSize) warnings.push(`Team size "${v.teamSize}" not understood — left empty`);

    let source: OutreachSource = 'Own research';
    if (v.source) {
      const hit = OUTREACH_SOURCES.find((s) => s.toLowerCase() === v.source!.toLowerCase());
      if (hit) source = hit;
      else warnings.push(`Source "${v.source}" is not one of ${OUTREACH_SOURCES.join(', ')} — set to Own research`);
    }

    let rep = ctx.defaultRep;
    if (v.bm) {
      const hit = ctx.reps.find((r) => sameRep(r.name, v.bm));
      if (hit) rep = hit;
      else warnings.push(`BM "${v.bm}" is not on the Outreach team — assigned to ${ctx.defaultRep.name}`);
    }

    const lead: OutreachLead | null = errors.length ? null : {
      id: newB2BId('OR'),
      company,
      contactPerson: v.contactPerson || '',
      designation: v.designation || undefined,
      phone,
      email: v.email || undefined,
      gstNumber: v.gstNumber ? v.gstNumber.toUpperCase() : undefined,
      city: v.city || undefined,
      officeAddress: v.officeAddress || undefined,
      companyType,
      companyTypeOther: companyType === 'Other' ? v.companyType : undefined,
      segment,
      teamSize,
      source,
      bm: rep.name,
      bmPhone: rep.phone,
      spok: rep.name,
      createdAt: ctx.at,
      status: 'Yet to Meet',
      statusChangedAt: ctx.at,
      meetings: [],
      selections: [],
      notes: v.note ? [{ ts: new Date(ctx.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), author: ctx.by, text: v.note }] : [],
      value: 0,
    };
    out.push({ line, company, phone, lead, errors, warnings });
  });
  return { rows: out, unknownHeaders: unknown, missingRequired, overLimit };
}

export const CSV_TEMPLATE: string[][] = [
  CSV_COLUMNS.map((c) => c.header),
  ['Studio Example', 'A. Designer', 'Principal', '9800000000', 'hello@example.com', '', 'Bangalore',
    '12 Example Road, Indiranagar', 'Interior Designer', '2', '2-5', 'Own research', '', 'Met at a design event'],
];

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
