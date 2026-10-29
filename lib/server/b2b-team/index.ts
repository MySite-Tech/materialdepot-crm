import { normalisePhone } from '@/lib/org/utils';
import { B2B_INBOUND_PIPELINE } from '@/lib/api/b2b/inbound/constants';
import {
  INBOUND_INTAKE_KYLAS_ID,
  INBOUND_ROTATION_BATCH,
  INBOUND_ROTATION_START,
  INBOUND_ROTATION_WINDOW_DAYS,
} from '@/lib/b2b/team/constants';
import type { MemberInput, RotationOutcome, SavedMember, TeamMember } from '@/lib/b2b/team/types';
import { memberForPhone, planRotation, rotationOrder, teamMembers } from '@/lib/b2b/team/utils';
import { intakePool, kylasUserForPhone, listKylasUsers, readLead, setLeadOwner } from './kylas';
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

export { listKylasUsers } from './kylas';
export { readMembers, TeamTableMissing } from './store';

export class InputError extends Error {}

const DAY_MS = 86_400_000;

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

export async function rotateInbound(byName: string, dryRun: boolean): Promise<RotationOutcome> {
  const outcome: RotationOutcome = { dryRun, assigned: [], failed: [], waiting: 0 };
  const { members, tableMissing } = await readMembers();
  if (tableMissing) return { ...outcome, skipped: 'The B2B team tables are not set up yet' };
  const order = rotationOrder(members);
  if (!order.length) {
    return { ...outcome, skipped: 'Nobody is in the inbound rotation — a B2B manager adds people under Team' };
  }

  const since = rotationSince();
  const [pool, assigned] = await Promise.all([intakePool(since), assignedLeadIdsSince(since)]);
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

  for (const { lead, member } of plan) {
    const to = member.kylasUserId as number;
    const claim = await claimRoundRobin({
      lead_id: lead.id,
      lead_created_at: lead.createdAt,
      kind: 'round_robin',
      to_kylas_id: to,
      to_name: member.name,
      from_kylas_id: INBOUND_INTAKE_KYLAS_ID,
      reason: null,
      by_name: byName,
    });
    if (claim == null) continue;
    if (to === INBOUND_INTAKE_KYLAS_ID) {
      outcome.assigned.push({ leadId: lead.id, to: member.name });
      continue;
    }
    try {
      await setLeadOwner(lead.id, to);
      outcome.assigned.push({ leadId: lead.id, to: member.name });
    } catch (e) {
      await releaseClaim(claim).catch(() => undefined);
      outcome.failed.push({ leadId: lead.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return outcome;
}

export async function reassignInboundLead(
  leadId: string,
  toPhone: string,
  reason: string,
  byName: string,
): Promise<TeamMember> {
  const id = String(leadId ?? '').trim();
  if (!/^\d+$/.test(id)) throw new InputError('leadId must be a Kylas lead id');

  const { members, tableMissing } = await readMembers();
  if (tableMissing) throw new InputError('The B2B team tables are not set up yet');
  const target = memberForPhone(teamMembers(members, 'inbound'), toPhone);
  if (!target || !target.active) throw new InputError('Leads can only go to an active inbound team member');

  const lead = await readLead(id);
  if (lead.pipelineId !== B2B_INBOUND_PIPELINE) throw new InputError('That lead is not in the inbound pipeline');
  if (lead.ownerId === target.kylasUserId) throw new InputError(`${target.name} already owns this lead`);

  await setLeadOwner(id, target.kylasUserId as number);
  await recordAssignment({
    lead_id: id,
    lead_created_at: lead.createdAt,
    kind: 'reassign',
    to_kylas_id: target.kylasUserId as number,
    to_name: target.name,
    from_kylas_id: lead.ownerId,
    reason: reason.trim().slice(0, 300) || null,
    by_name: byName,
  });
  return target;
}
