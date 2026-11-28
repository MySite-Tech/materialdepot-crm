import type { NextRequest } from 'next/server';
import { requireCaller, sessionErrorResponse, staffDirectory, type Caller, type StaffEntry } from '@/lib/server/session';
import { B2BBackendError } from '@/lib/server/b2b-backend';
import { assignLeads, claimLead, importBatch, logCall, readBank, recordImport, releaseLead, setPlan } from '@/lib/server/bda-retail';
import { BDA_RETAIL_ACCESS, CALL_OUTCOMES, COHORT_BY_KEY, MAX_UNANSWERED, PRIORITIES } from '@/lib/bda-retail/constants';
import type { AccessRow, BankLead, BdaAccess, BdaPerson, CallOutcome, CohortKey, ImportDiag, Priority } from '@/lib/bda-retail/types';
import { accessName, cohortsFor, isBda, isBdaAdmin, istToday, planPriorities } from '@/lib/bda-retail/utils';
import { normalisePhone } from '@/lib/org/utils';

export const dynamic = 'force-dynamic';

const MAX_BATCH = 1000;
const MAX_NOTE = 1000;

const bad = (error: string, status = 400) => Response.json({ error }, { status });

const text = (v: unknown, max: number): string => String(v ?? '').trim().slice(0, max);

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

const loginsNamed = (staff: { name: string }[], name: string) => staff.filter((s) => accessName(s.name) === accessName(name)).length;

interface Auth {
  caller: Caller;
  phone: string;
  access: BdaAccess;
  admins: AccessRow[];
  bdas: BdaPerson[];
}

const bdasOf = (staff: StaffEntry[]): BdaPerson[] => staff
  .filter((s) => s.active && isBda(s) && normalisePhone(s.phone).length === 10)
  .map((s) => ({ name: s.name || normalisePhone(s.phone), phone: normalisePhone(s.phone) }))
  .sort((a, b) => a.name.localeCompare(b.name));

async function authorise(request: NextRequest): Promise<Auth | Response> {
  try {
    const caller = await requireCaller(request);
    const phone = normalisePhone(caller.phone);
    if (isBdaAdmin(caller)) {
      const staff = await staffDirectory(request.headers.get('authorization') ?? '');
      if (loginsNamed(staff, caller.name) !== 1) {
        return bad(`More than one login is named ${caller.name}, so BDA Retail cannot tell which one was given access`, 403);
      }
      return { caller, phone, access: 'admin', admins: BDA_RETAIL_ACCESS.map((name) => ({ name, logins: loginsNamed(staff, name) })), bdas: bdasOf(staff) };
    }
    if (isBda(caller)) return { caller, phone, access: 'bda', admins: [], bdas: [] };
    return bad('Your account does not have access to BDA Retail', 403);
  } catch (err) {
    return sessionErrorResponse(err) ?? bad('Not authenticated', 401);
  }
}

const failure = (err: unknown): Response =>
  err instanceof B2BBackendError
    ? bad(err.message, err.status === 409 || err.status === 404 ? err.status : 502)
    : bad('Could not reach the B2B backend', 502);

function counts(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries((raw ?? {}) as Record<string, unknown>).slice(0, 60)) {
    if (Number.isFinite(Number(v))) out[text(k, 80)] = Number(v);
  }
  return out;
}

function cleanDiag(raw: unknown): ImportDiag | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 60).map((x) => text(x, 80)) : []);
  return { cartFields: list(d.cartFields), visitFields: list(d.visitFields), statuses: counts(d.statuses), branches: counts(d.branches) };
}

function cleanLead(raw: unknown): BankLead | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const cohort = r.cohort as CohortKey;
  const phone = normalisePhone(text(r.phone, 20));
  if (!COHORT_BY_KEY[cohort] || phone.length !== 10 || !isDate(r.enteredOn)) return null;
  return {
    key: `${cohort}:${phone}`,
    cohort,
    phone,
    name: text(r.name, 120),
    branch: text(r.branch, 80),
    bm: text(r.bm, 80),
    enteredOn: r.enteredOn,
    value: Number.isFinite(Number(r.value)) ? Number(r.value) : 0,
    ref: text(r.ref, 80),
    detail: text(r.detail, 300),
  };
}

export async function GET(request: NextRequest) {
  const auth = await authorise(request);
  if (auth instanceof Response) return auth;
  try {
    if (auth.access === 'admin') {
      return Response.json({ bank: await readBank(null), access: auth.access, admins: auth.admins, bdas: auth.bdas, maxUnanswered: MAX_UNANSWERED });
    }
    const mine = await readBank({ phone: auth.phone, cohorts: [] });
    const active = cohortsFor(planPriorities(istToday().slice(0, 7), mine.plan));
    const bank = await readBank({ phone: auth.phone, cohorts: active });
    return Response.json({ bank: { ...bank, imports: [] }, access: auth.access, admins: [], maxUnanswered: MAX_UNANSWERED });
  } catch (err) {
    return failure(err);
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorise(request);
  if (auth instanceof Response) return auth;
  const { caller, phone } = auth;
  const admin = auth.access === 'admin';
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    switch (body.action) {
      case 'import-leads': {
        if (!admin) return bad('Only a BDA Retail admin can fetch new leads', 403);
        const raw = Array.isArray(body.leads) ? body.leads : [];
        if (raw.length > MAX_BATCH) return bad(`Send at most ${MAX_BATCH} leads at a time`);
        return Response.json(await importBatch(raw.map(cleanLead).filter((l): l is BankLead => !!l)));
      }
      case 'import-run': {
        if (!admin) return bad('Only a BDA Retail admin can fetch new leads', 403);
        const n = (k: string) => Math.max(0, Number(body[k]) || 0);
        const run = await recordImport({
          by: caller.name,
          added: n('added'),
          refreshed: n('refreshed'),
          samePerson: n('samePerson'),
          skippedActive: n('skippedActive'),
          byCohort: counts(body.byCohort),
          read: counts(body.read),
          diag: cleanDiag(body.diag),
        });
        return Response.json({ run });
      }
      case 'assign': {
        if (!admin) return bad('Only a BDA Retail admin can assign leads', 403);
        const raw = Array.isArray(body.assignments) ? body.assignments : [];
        if (raw.length > MAX_BATCH) return bad(`Assign at most ${MAX_BATCH} leads at a time`);
        const byPhone = new Map(auth.bdas.map((b) => [b.phone, b.name]));
        const assignments = raw.map((a) => {
          const r = (a ?? {}) as Record<string, unknown>;
          const to = normalisePhone(text(r.phone, 20));
          return { key: text(r.key, 120), phone: to, by: byPhone.get(to) ?? '' };
        });
        if (assignments.some((a) => !a.by)) return bad('Leads can only go to people with the BDA Retail role');
        return Response.json({ assigned: await assignLeads(assignments) });
      }
      case 'claim':
        return Response.json({ claim: await claimLead(text(body.key, 120), caller.name, phone) });
      case 'release': {
        if (!admin) return bad('Only a BDA Retail admin can return a lead to the queue', 403);
        await releaseLead(text(body.key, 120));
        return Response.json({ ok: true });
      }
      case 'call': {
        const outcome = CALL_OUTCOMES.find((o) => o.key === body.outcome);
        if (!outcome) return bad('Pick what happened on the call');
        const followUpOn = isDate(body.followUpOn) ? body.followUpOn : '';
        if (outcome.needsDate && !followUpOn) return bad('This outcome needs a follow-up date');
        const note = text(body.note, MAX_NOTE);
        if (outcome.connected && !note) return bad('Add a note on what the customer said');
        const call = await logCall({
          key: text(body.key, 120),
          by: caller.name,
          phone,
          outcome: outcome.key as CallOutcome,
          note,
          followUpOn: outcome.needsDate ? followUpOn : '',
        });
        return Response.json({ call });
      }
      case 'plan': {
        if (!admin) return bad('Only a BDA Retail admin can change the calling plan', 403);
        const month = text(body.month, 7);
        if (!/^\d{4}-\d{2}$/.test(month)) return bad('Bad month');
        const list = Array.isArray(body.priorities) ? PRIORITIES.filter((p) => (body.priorities as unknown[]).includes(p)) : null;
        await setPlan(month, list as Priority[] | null, caller.name);
        return Response.json({ ok: true });
      }
      default:
        return bad('Unknown action');
    }
  } catch (err) {
    return failure(err);
  }
}
