import { normalisePhone } from '@/lib/org/utils';
import {
  INBOUND_INTAKE_KYLAS_ID,
  INBOUND_ROTATION_BATCH,
  INBOUND_ROTATION_START,
  INBOUND_ROTATION_WINDOW_DAYS,
} from '@/lib/b2b/team/constants';
import type { MemberInput, ReassignOutcome, RotationOutcome, SavedMember, TeamMember } from '@/lib/b2b/team/types';
import { memberForPhone, planRotation, rotationOrder, teamMembers } from '@/lib/b2b/team/utils';
import { intakePool, kylasUserForPhone, listKylasUsers } from './kylas';
import { importInbound, ownerChange, readInboundRows, writeInbound, type ImportOutcome } from '@/lib/server/b2b-inbound';
import {
  assignedLeadIdsSince,
  claimRoundRobin,
  lastRoundRobinKylasId,
  readMembers,
  recordAssignment,
  releaseClaim,
  upsertMember,
  workedInboundLeadIds,
} from './store';

export { KylasBusy, listKylasUsers } from './kylas';
export { readMembers, TeamTableMissing } from './store';

export class InputError extends Error {}

const DAY_MS = 86_400_000;
const ASSIGNMENT_LOG_FROM = '2000-01-01T00:00:00Z';

function rotationSince(now = Date.now()): string {
  const start = new Date(INBOUND_ROTATION_START).getTime();
  return new Date(Math.max(start, now - INBOUND_ROTATION_WINDOW_DAYS * DAY_MS)).toISOString();
}

export async function saveMember(input: MemberInput, byName: string): Promise<SavedMember> {
  const phone = normalisePhone(input.phone);
  if (phone.length !== 10) throw new InputError('A team member needs a 10-digit phone number');
  const name = String(input.name ?? '').trim();
  if (!name) throw new InputError('A team member needs a name');

  let kylasUserId = input.kylasUserId ?? null;
  let kylasName: string | null = null;
  let warning: string | undefined;
  const users = await listKylasUsers();
  if (input.kylasUserId === undefined) {
    const hit = kylasUserForPhone(users, phone);
    kylasUserId = hit?.id ?? null;
    kylasName = hit?.name ?? null;
    if (!hit && input.team === 'inbound') warning = `No Kylas user has the phone ${phone}. Pick their Kylas user by hand, or they cannot own leads.`;
    else if (hit && !hit.active) warning = `${hit.name} is deactivated in Kylas.`;
  } else if (kylasUserId != null) {
    const hit = users.find((u) => u.id === kylasUserId);
    if (!hit) throw new InputError(`Kylas has no user ${kylasUserId}`);
    kylasName = hit.name;
  }

  const member = await upsertMember({
    phone,
    name,
    team: input.team,
    kylasUserId,
    kylasName,
    inRotation: input.inRotation,
    active: input.active,
    isAdmin: input.isAdmin,
    updatedBy: byName,
  });
  return { member, warning };
}

export async function syncInbound(byName: string, full: boolean): Promise<RotationOutcome & ImportOutcome> {
  const { members, tableMissing } = await readMembers();
  if (tableMissing) throw new InputError('The B2B team tables are not set up yet');
  const imported = await importInbound(members, full);
  return { ...(await rotateInbound(byName, false)), ...imported };
}

export async function rotateInbound(byName: string, dryRun: boolean): Promise<RotationOutcome> {
  const outcome: RotationOutcome = { dryRun, assigned: [], failed: [], waiting: 0 };
  const { members, tableMissing } = await readMembers();
  if (tableMissing) return { ...outcome, skipped: 'The B2B team tables are not set up yet' };
  const order = rotationOrder(members);
  if (!order.length) {
    return { ...outcome, skipped: 'Nobody is in the inbound rotation — a B2B manager adds people under Team' };
  }

  const since = rotationSince();
  const [pool, assigned] = await Promise.all([intakePool(since), assignedLeadIdsSince(ASSIGNMENT_LOG_FROM)]);
  const fresh = pool.filter((l) => !assigned.has(l.id));
  const worked = await workedInboundLeadIds(fresh.map((l) => l.id));
  const queue = fresh.filter((l) => !worked.has(l.id));
  const batch = queue.slice(0, INBOUND_ROTATION_BATCH);
  outcome.waiting = queue.length - batch.length;

  const plan = planRotation(batch, order, await lastRoundRobinKylasId());
  if (dryRun) {
    outcome.assigned = plan.map(({ lead, member }) => ({ leadId: lead.id, to: member.name }));
    return outcome;
  }

  const claimed: { leadId: string; claim: number; member: TeamMember }[] = [];
  for (const { lead, member } of plan) {
    const claim = await claimRoundRobin({
      lead_id: lead.id,
      lead_created_at: lead.createdAt,
      kind: 'round_robin',
      to_kylas_id: member.kylasUserId as number,
      to_name: member.name,
      from_kylas_id: INBOUND_INTAKE_KYLAS_ID,
      reason: null,
      by_name: byName,
    });
    if (claim != null) claimed.push({ leadId: lead.id, claim, member });
  }
  if (!claimed.length) return outcome;

  const release = async (ids: Set<string>, error: string) => {
    for (const c of claimed.filter((x) => ids.has(x.leadId))) {
      await releaseClaim(c.claim).catch(() => undefined);
      outcome.failed.push({ leadId: c.leadId, error });
    }
  };
  try {
    const { missing } = await writeInbound(claimed.map((c) => ({
      id: c.leadId, change: ownerChange(c.member.name, c.member.kylasUserId as number),
    })));
    const gone = new Set(missing);
    await release(gone, 'Not imported into the CRM yet');
    for (const c of claimed) if (!gone.has(c.leadId)) outcome.assigned.push({ leadId: c.leadId, to: c.member.name });
  } catch (e) {
    await release(new Set(claimed.map((c) => c.leadId)), e instanceof Error ? e.message : String(e));
  }
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
): Promise<TeamMember> {
  const out = await reassignInboundLeads([{ leadId, toPhone }], reason, byName);
  if (out.failed.length) throw new InputError(out.failed[0].error);
  return memberForPhone(teamMembers((await readMembers()).members, 'inbound'), toPhone) as TeamMember;
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
  for (const { leadId, toPhone } of items) {
    const id = String(leadId ?? '').trim();
    try {
      const to = await inboundTarget(toPhone, read);
      const row = rows.get(id);
      if (!row) throw new InputError('That lead is not in the CRM yet. Sync from Kylas, then try again.');
      if (Number(row.meta_data?.owner_kylas_id) === to.kylasUserId) throw new InputError(`${to.name} already owns this lead`);
      planned.push({ leadId: id, to });
    } catch (e) {
      outcome.failed.push({ leadId: id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (!planned.length) return outcome;

  await writeInbound(planned.map(({ leadId, to }) => ({ id: leadId, change: ownerChange(to.name, to.kylasUserId as number) })));
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
  return outcome;
}
