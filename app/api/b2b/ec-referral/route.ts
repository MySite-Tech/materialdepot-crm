import type { NextRequest } from 'next/server';
import { requireCaller, sessionErrorResponse, type Caller } from '@/lib/server/session';
import { B2BBackendError, b2bBackendFetch } from '@/lib/server/b2b-backend';
import { MY_REFERRALS_LIMIT } from '@/lib/b2b/ec-referral/constants';
import type { MyReferral } from '@/lib/b2b/ec-referral/types';
import { canReferToB2B } from '@/lib/b2b/ec-referral/utils';
import type { B2BLeadRow } from '@/lib/b2b/data/rows';
import { outreachToRow, rowToOutreach } from '@/lib/b2b/mappers/outreach';
import { normalisePhone } from '@/lib/org/utils';
import { newB2BId } from '@/components/b2b/models/ids';
import type { OutreachLead } from '@/components/b2b/models/mock-data';
import { COMPANY_TYPES, CompanyType, EC_B2B_REFERRAL } from '@/components/b2b/models/outreach';
import { EcReferralInput, leadFromEcReferral } from '@/components/b2b/models/outreach/intake';
import { withJourney } from '@/components/b2b/models/outreach/reminders';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => Response.json({ error }, { status });

const text = (v: unknown, max: number): string => String(v ?? '').trim().slice(0, max);

async function caller(request: NextRequest): Promise<Caller | Response> {
  let c: Caller;
  try {
    c = await requireCaller(request);
  } catch (err) {
    return sessionErrorResponse(err) ?? bad('Not authenticated', 401);
  }
  return canReferToB2B(c) ? c : bad('Your account cannot send EC B2B referrals', 403);
}

const failure = (err: unknown): Response =>
  bad(err instanceof B2BBackendError ? err.message : 'Could not reach the B2B backend', 502);

const summary = (l: OutreachLead): MyReferral => ({
  id: l.id,
  company: l.company,
  contactPerson: l.contactPerson,
  ec: l.ecReferral?.ec ?? '',
  at: l.ecReferral?.at ?? l.createdAt ?? '',
  status: l.status,
  bm: l.bm,
});

const clientPhones = (r: B2BLeadRow): string[] =>
  (Array.isArray(r.meta_data?.contacts) ? r.meta_data.contacts : []).map((c: { number?: string }) => normalisePhone(c?.number));

function holder(rows: B2BLeadRow[], phone: string): string | null {
  const lead = rows
    .filter((r) => r.pipeline === 'outbound')
    .map(rowToOutreach)
    .find((l) => l.status !== 'Lost' && normalisePhone(l.phone) === phone);
  if (lead) return `This number is already with Outreach as ${lead.company}${lead.bm ? ` (${lead.bm})` : ', waiting to be assigned'}.`;
  const firm = rows.find((r) => r.pipeline === 'client' && clientPhones(r).includes(phone));
  if (!firm) return null;
  const kam = String(firm.meta_data?.kam ?? '').trim();
  return `This number is already a B2B client, ${String(firm.meta_data?.company ?? 'an existing firm')}${kam ? ` (KAM ${kam})` : ''}.`;
}

function parse(body: Record<string, unknown>): EcReferralInput | string {
  const company = text(body.company, 200);
  const contactPerson = text(body.contactPerson, 120);
  const phone = normalisePhone(String(body.phone ?? ''));
  const ec = text(body.ec, 80);
  const companyType = String(body.companyType ?? '') as CompanyType;
  if (!company || !contactPerson || !ec) return "'company', 'contactPerson' and 'ec' are required";
  if (phone.length !== 10) return 'The mobile number must have 10 digits';
  if (!COMPANY_TYPES.includes(companyType)) return "Unknown 'companyType'";
  return {
    company, contactPerson, phone, ec, companyType,
    designation: text(body.designation, 80) || undefined,
    city: text(body.city, 80) || undefined,
    requirement: text(body.requirement, 1000) || undefined,
  };
}

export async function GET(request: NextRequest) {
  const c = await caller(request);
  if (c instanceof Response) return c;
  const me = normalisePhone(c.phone);
  try {
    const rows = await b2bBackendFetch<B2BLeadRow[]>('/rows');
    const mine = rows
      .filter((r) => r.pipeline === 'outbound')
      .map(rowToOutreach)
      .filter((l) => l.source === EC_B2B_REFERRAL && !!me && normalisePhone(l.ecReferral?.byPhone) === me)
      .sort((a, b) => String(b.ecReferral?.at).localeCompare(String(a.ecReferral?.at)))
      .slice(0, MY_REFERRALS_LIMIT);
    return Response.json(mine.map(summary));
  } catch (err) {
    return failure(err);
  }
}

export async function POST(request: NextRequest) {
  const c = await caller(request);
  if (c instanceof Response) return c;

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return bad('Body must be JSON'); }
  const input = parse(body);
  if (typeof input === 'string') return bad(input);

  try {
    const taken = holder(await b2bBackendFetch<B2BLeadRow[]>('/rows'), input.phone);
    if (taken) return bad(taken, 409);
    const at = new Date().toISOString();
    const lead = withJourney(null, leadFromEcReferral(input, { name: c.name, phone: normalisePhone(c.phone) }, newB2BId('OR-EC'), at), c.name, at);
    await b2bBackendFetch('/rows', { method: 'POST', body: outreachToRow(lead) });
    return Response.json(summary(lead));
  } catch (err) {
    return failure(err);
  }
}
