import { normalisePhone } from '@/lib/org/utils';
import {
  INBOUND_BACKLOG_BATCH,
  INBOUND_INTAKE_KYLAS_ID,
  INBOUND_KYLAS_OWNER_WRITES,
  INBOUND_ROTATION_BATCH,
  INBOUND_ROTATION_START,
  INBOUND_ROTATION_WINDOW_DAYS,
} from '@/lib/b2b/team/constants';
import type { KylasOwnerWrites, MemberInput, ReassignOutcome, RenumberOutcome, RotationOutcome, SavedMember, TeamMember } from '@/lib/b2b/team/types';
import { B2BBackendError } from '@/lib/server/b2b-backend';
import { memberForPhone, planRotation, rotationOrder, teamMembers } from '@/lib/b2b/team/utils';
import { KylasBusy, inboundLeadsByIds, intakePool, kylasUserForPhone, listKylasUsers, setLeadOwner, type PoolLead } from './kylas';
import { importInbound, inboundOwnerNames, inboundRowFromKylas, ownerChange, readInboundRows, writeInbound, type ImportOutcome, type InboundRows } from '@/lib/server/b2b-inbound';
import {
  assignedLeadIdsSince,
  claimRoundRobin,
  lastRoundRobinKylasId,
  readMembers,
  recordAssignment,
  releaseClaim,
  renumberMember,
  upsertMember,
  workedInboundLeadIds,
} from './store';

export { KylasBusy, listKylasUsers } from './kylas';
export { readMembers, TeamTableMissing } from './store';

export class InputError extends Error {}

const DAY_MS = 86_400_000;
const ASSIGNMENT_LOG_FROM = '2000-01-01T00:00:00Z';

function untouchedOnIntake(rows: InboundRows): PoolLead[] {
  return [...rows.entries()]
    .filter(([, r]) => Number(r.meta_data?.owner_kylas_id) === INBOUND_INTAKE_KYLAS_ID
      && r.stage === 'New'
      && !(Array.isArray(r.meta_data?.call_attempts) && r.meta_data.call_attempts.length))
    .map(([id, r]) => ({ id, createdAt: String(r.meta_data?.lead_created_at || r.created_at || '') }));
}

interface OwnerMove {
  leadId: string;
  kylasUserId: number;
}

const IN_KYLAS = /^\d+$/;

async function writeKylasOwners(all: OwnerMove[]): Promise<KylasOwnerWrites> {
  const moves = all.filter((m) => IN_KYLAS.test(m.leadId));
  const out: KylasOwnerWrites = { written: 0, failed: [], pending: Math.max(0, moves.length - INBOUND_KYLAS_OWNER_WRITES) };
  const now = moves.slice(0, INBOUND_KYLAS_OWNER_WRITES);
  for (let i = 0; i < now.length; i++) {
    try {
      await setLeadOwner(now[i].leadId, now[i].kylasUserId);
      out.written += 1;
    } catch (e) {
      if (e instanceof KylasBusy) {
        out.pending += now.length - i;
        break;
      }
      const error = e instanceof Error ? e.message : String(e);
      console.error(`[b2b] Kylas owner write failed for lead ${now[i].leadId}: ${error}`);
      out.failed.push({ leadId: now[i].leadId, error });
    }
  }
  return out;
}

const crmOwnerId = (row: { meta_data?: Record<string, any> } | undefined): number | null => {
  const id = Number(row?.meta_data?.owner_kylas_id);
  return Number.isFinite(id) && id > 0 ? id : null;
};

function rotationSince(now = Date.now()): string {
  const start = new Date(INBOUND_ROTATION_START).getTime();
  return new Date(Math.max(start, now - INBOUND_ROTATION_WINDOW_DAYS * DAY_MS)).toISOString();
}

const personName = (s: string | undefined) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export async function saveMember(input: MemberInput, byName: string): Promise<SavedMember> {
  const phone = normalisePhone(input.phone);
  if (phone.length !== 10) throw new InputError('A team member needs a 10-digit phone number');
  const { members, coverReady, pauseReady, tenureReady } = await readMembers();
  const sameName = (m: TeamMember) => personName(m.name) === personName(input.name || m.name);
  const stored = input.id != null
    ? members.find((m) => m.id === input.id)
    : members.find((m) => m.phone === phone && m.team === input.team && !m.leftOn && sameName(m));
  if (input.id != null && !stored) throw new InputError('That team row no longer exists. Reload the Team tab.');
  const name = String(input.name ?? '').trim() || stored?.name || '';
  if (!name) throw new InputError('A team member needs a name');
  const cover = coverFor(input, stored, members.filter((m) => m.phone === phone && m.team !== input.team && !m.leftOn), coverReady);
  const pause = pauseFor(input, pauseReady);
  const tenure = tenureFor(input, stored, tenureReady);

  let kylasUserId = input.kylasUserId !== undefined ? input.kylasUserId : stored?.kylasUserId ?? null;
  let kylasName: string | null = input.kylasUserId === undefined ? stored?.kylasName ?? null : null;
  let warning: string | undefined;
  const pastRecord = !stored && input.active === false && !!input.leftOn;
  const linking = input.kylasUserId != null || (input.kylasUserId === undefined && !stored && !pastRecord);
  const users = linking ? await listKylasUsers() : [];
  if (input.kylasUserId === undefined && !stored) {
    const linked = members.find((m) => m.phone === phone && m.kylasUserId != null)?.kylasUserId;
    const hit = kylasUserForPhone(users, phone) ?? users.find((u) => u.id === linked) ?? null;
    kylasUserId = hit?.id ?? null;
    kylasName = hit?.name ?? null;
    if (!hit && input.team === 'inbound') warning = `No Kylas user has the phone ${phone}. Pick their Kylas user by hand, or they cannot own leads.`;
    else if (hit && !hit.active) warning = `${hit.name} is deactivated in Kylas.`;
  } else if (input.kylasUserId != null) {
    const hit = users.find((u) => u.id === input.kylasUserId);
    if (!hit) throw new InputError(`Kylas has no user ${kylasUserId}`);
    kylasName = hit.name;
  }

  const member = await upsertMember({
    id: stored?.id ?? null,
    phone,
    name,
    team: input.team,
    kylasUserId,
    kylasName,
    inRotation: input.inRotation ?? stored?.inRotation ?? true,
    active: input.active ?? stored?.active ?? true,
    isAdmin: input.isAdmin,
    cover,
    pause,
    tenure,
    updatedBy: byName,
  });
  return { member, warning };
}

function tenureFor(input: MemberInput, stored: TeamMember | undefined, ready: boolean): Partial<Pick<TeamMember, 'joinedOn' | 'leftOn'>> | undefined {
  if (input.joinedOn === undefined && input.leftOn === undefined) return undefined;
  if (!ready) throw new InputError('Dating a membership needs b2b-backend migration 0034 deployed first');
  const out: Partial<Pick<TeamMember, 'joinedOn' | 'leftOn'>> = {};
  if (input.joinedOn !== undefined) out.joinedOn = input.joinedOn ?? null;
  if (input.leftOn !== undefined) out.leftOn = input.leftOn ?? null;
  const joined = out.joinedOn !== undefined ? out.joinedOn : stored?.joinedOn ?? null;
  const left = out.leftOn !== undefined ? out.leftOn : stored?.leftOn ?? null;
  if (joined && left && left < joined) throw new InputError('The last day is before the first day');
  return out;
}

function pauseFor(input: MemberInput, ready: boolean): Pick<TeamMember, 'pausedFrom' | 'pausedTo'> | undefined {
  if (input.pausedFrom === undefined && input.pausedTo === undefined) return undefined;
  if (!ready) throw new InputError('Pausing for set days needs b2b-backend migration 0032 deployed first');
  const pausedFrom = input.pausedFrom ?? null;
  const pausedTo = input.pausedTo ?? null;
  if (!pausedFrom !== !pausedTo) throw new InputError('A pause needs a first and a last day');
  if (pausedFrom && pausedTo && pausedTo < pausedFrom) throw new InputError('The pause ends before it starts');
  return { pausedFrom, pausedTo };
}

function coverFor(input: MemberInput, stored: TeamMember | undefined, others: TeamMember[], ready: boolean): Pick<TeamMember, 'primary' | 'from' | 'to'> | undefined {
  const asked = input.primary !== undefined || input.from !== undefined || input.to !== undefined;
  if (!ready) {
    if (asked) throw new InputError('Primary teams and cover dates need b2b-backend migration 0031 deployed first');
    return undefined;
  }
  const from = input.from !== undefined ? input.from : stored?.from ?? null;
  const to = input.to !== undefined ? input.to : stored?.to ?? null;
  if (from && to && to < from) throw new InputError('The cover ends before it starts');
  if (from || to) return { primary: false, from, to };
  const primary = input.primary ?? (stored ? stored.primary : !others.some((m) => m.active));
  if (!asked && stored) return undefined;
  return { primary, from: null, to: null };
}

export async function changeMemberNumber(fromPhone: string, toPhone: string, byName: string): Promise<RenumberOutcome> {
  const from = normalisePhone(fromPhone);
  const to = normalisePhone(toPhone);
  if (from.length !== 10 || to.length !== 10) throw new InputError('Both numbers must have 10 digits');
  if (from === to) throw new InputError('That is already their number');
  try {
    return await renumberMember(from, to, byName);
  } catch (e) {
    if (e instanceof B2BBackendError && e.status === 404 && e.message === 'Not Found') {
      throw new InputError('Changing a number needs the b2b-backend /team/renumber route, which is not deployed yet');
    }
    if (e instanceof B2BBackendError && e.status < 500) throw new InputError(e.message);
    throw e;
  }
}

export async function syncInbound(byName: string, full: boolean): Promise<RotationOutcome & ImportOutcome> {
  const { members, tableMissing } = await readMembers();
  if (tableMissing) throw new InputError('The B2B team tables are not set up yet');
  const { rows, ...imported } = await importInbound(members, full);
  return { ...(await rotateInbound(byName, false, false, rows)), ...imported };
}

export async function rotateInbound(byName: string, dryRun: boolean, backlog: boolean, known?: InboundRows): Promise<RotationOutcome> {
  const outcome: RotationOutcome = { dryRun, assigned: [], failed: [], waiting: 0, backlog: 0 };
  const { members, tableMissing } = await readMembers();
  if (tableMissing) return { ...outcome, skipped: 'The B2B team tables are not set up yet' };
  const order = rotationOrder(members);
  if (!order.length) {
    return { ...outcome, skipped: 'Nobody is in the inbound rotation — a B2B manager adds people under Team' };
  }

  const since = rotationSince();
  const [pool, assigned, rows] = await Promise.all([intakePool(since), assignedLeadIdsSince(ASSIGNMENT_LOG_FROM), known ?? readInboundRows()]);
  const inKylasPool = new Set(pool.map((l) => l.id));
  const start = new Date(INBOUND_ROTATION_START).getTime();
  const held = untouchedOnIntake(rows).filter((l) => !assigned.has(l.id) && !inKylasPool.has(l.id));
  const recent = held.filter((l) => Date.parse(l.createdAt) >= start);
  const older = held.filter((l) => !(Date.parse(l.createdAt) >= start));
  const fresh = [...pool.filter((l) => !assigned.has(l.id)), ...recent, ...(backlog ? older : [])];
  const worked = await workedInboundLeadIds(fresh.map((l) => l.id));
  const queue = fresh.filter((l) => !worked.has(l.id));
  const batch = queue.slice(0, backlog ? INBOUND_BACKLOG_BATCH : INBOUND_ROTATION_BATCH);
  outcome.waiting = queue.length - batch.length;
  outcome.backlog = backlog ? 0 : older.length;

  const plan = planRotation(batch, order, await lastRoundRobinKylasId());
  const dealt = new Set(plan.map(({ lead }) => lead.id));
  const behind: OwnerMove[] = pool.flatMap((l) => {
    const owner = crmOwnerId(rows.get(l.id));
    return owner && owner !== INBOUND_INTAKE_KYLAS_ID && !dealt.has(l.id) ? [{ leadId: l.id, kylasUserId: owner }] : [];
  });
  if (dryRun) {
    outcome.assigned = plan.map(({ lead, member }) => ({ leadId: lead.id, to: member.name }));
    outcome.kylas = { written: 0, failed: [], pending: behind.length };
    return outcome;
  }

  const claimed: { leadId: string; claim: number; member: TeamMember; raw?: Record<string, any> }[] = [];
  for (const { lead, member } of plan) {
    const claim = await claimRoundRobin({
      lead_id: lead.id,
      lead_created_at: lead.createdAt || null,
      kind: 'round_robin',
      to_kylas_id: member.kylasUserId as number,
      to_name: member.name,
      from_kylas_id: INBOUND_INTAKE_KYLAS_ID,
      reason: null,
      by_name: byName,
    });
    if (claim != null) claimed.push({ leadId: lead.id, claim, member, raw: lead.raw });
  }
  const release = async (ids: Set<string>, error: string) => {
    for (const c of claimed.filter((x) => ids.has(x.leadId))) {
      await releaseClaim(c.claim).catch(() => undefined);
      outcome.failed.push({ leadId: c.leadId, error });
    }
  };
  const moves: OwnerMove[] = [];
  if (claimed.length) {
    try {
      const names = inboundOwnerNames(members);
      await writeInbound(claimed.map((c) => ({
        id: c.leadId,
        change: ownerChange(c.member.name, c.member.kylasUserId as number),
        fallback: c.raw ? inboundRowFromKylas(c.raw, names) : undefined,
      })));
      for (const c of claimed) {
        outcome.assigned.push({ leadId: c.leadId, to: c.member.name });
        const inKylas = Number(c.raw?.ownerId) || INBOUND_INTAKE_KYLAS_ID;
        if (c.member.kylasUserId !== inKylas) moves.push({ leadId: c.leadId, kylasUserId: c.member.kylasUserId as number });
      }
    } catch (e) {
      await release(new Set(claimed.map((c) => c.leadId)), e instanceof Error ? e.message : String(e));
    }
  }
  outcome.kylas = await writeKylasOwners([...moves, ...behind]);
  return outcome;
}

async function inboundTarget(toPhone: string, read: Awaited<ReturnType<typeof readMembers>>): Promise<TeamMember> {
  if (read.tableMissing) throw new InputError('The B2B team tables are not set up yet');
  const target = memberForPhone(teamMembers(read.members, 'inbound'), toPhone);
  if (!target || !target.active) throw new InputError('Leads can only go to an active inbound team member');
  return target;
}

export async function reassignInboundLead(
  leadId: string,
  toPhone: string,
  reason: string,
  byName: string,
): Promise<{ member: TeamMember; kylas?: KylasOwnerWrites }> {
  const out = await reassignInboundLeads([{ leadId, toPhone }], reason, byName);
  if (out.failed.length) throw new InputError(out.failed[0].error);
  return { member: memberForPhone(teamMembers((await readMembers()).members, 'inbound'), toPhone) as TeamMember, kylas: out.kylas };
}

export async function reassignInboundLeads(
  items: { leadId: string; toPhone: string }[],
  reason: string,
  byName: string,
): Promise<ReassignOutcome> {
  if (items.length > INBOUND_ROTATION_BATCH) throw new InputError(`Inbound leads move ${INBOUND_ROTATION_BATCH} at a time`);
  const read = await readMembers();
  const rows = await readInboundRows();
  const outcome: ReassignOutcome = { moved: [], failed: [] };
  const planned: { leadId: string; to: TeamMember }[] = [];
  const fallbacks = new Map<string, NonNullable<ReturnType<typeof rows.get>>>();
  const absent = items.map((i) => String(i.leadId ?? '').trim()).filter((id) => id && !rows.has(id));
  const fromKylas = await inboundLeadsByIds(absent);
  for (const { leadId, toPhone } of items) {
    const id = String(leadId ?? '').trim();
    try {
      const to = await inboundTarget(toPhone, read);
      let row = rows.get(id);
      if (!row) {
        const raw = fromKylas.get(id);
        if (!raw) throw new InputError('Kylas has no inbound lead with that id.');
        row = inboundRowFromKylas(raw, inboundOwnerNames(read.members));
        rows.set(id, row);
        fallbacks.set(id, row);
      }
      if (Number(row.meta_data?.owner_kylas_id) === to.kylasUserId) throw new InputError(`${to.name} already owns this lead`);
      planned.push({ leadId: id, to });
    } catch (e) {
      outcome.failed.push({ leadId: id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (!planned.length) return outcome;

  await writeInbound(planned.map(({ leadId, to }) => ({
    id: leadId,
    change: ownerChange(to.name, to.kylasUserId as number),
    fallback: fallbacks.get(leadId),
  })));
  for (const { leadId, to } of planned) {
    const row = rows.get(leadId) as NonNullable<ReturnType<typeof rows.get>>;
    const from = Number(row.meta_data?.owner_kylas_id);
    await recordAssignment({
      lead_id: leadId,
      lead_created_at: row.meta_data?.lead_created_at ? String(row.meta_data.lead_created_at) : null,
      kind: 'reassign',
      to_kylas_id: to.kylasUserId as number,
      to_name: to.name,
      from_kylas_id: Number.isFinite(from) && from ? from : null,
      reason: reason.trim().slice(0, 300) || null,
      by_name: byName,
    });
    outcome.moved.push({ leadId, name: to.name, kylasUserId: to.kylasUserId as number });
  }
  outcome.kylas = await writeKylasOwners(planned.map(({ leadId, to }) => ({ leadId, kylasUserId: to.kylasUserId as number })));
  return outcome;
}
