import { B2B_ROSTER } from '../../../../components/b2b/models/roster';
import { HOLDER_RANK } from '../constants';
import type { B2BTeam, TeamMember } from '../../team/types';
import type { B2BSourceRow, Holder, HolderKind, NumberBook, RedirectInput, RepTeams, StudioFirm } from '../types';

export const phoneOf = (raw: unknown): string => {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? digits : '';
};

const repKey = (name: unknown): string => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const FULL_NAMES = new Map(B2B_ROSTER.map((r) => [repKey(r.name), r.fullName]));

export const repName = (name: unknown): string => {
  const trimmed = String(name ?? '').trim().replace(/\s+/g, ' ');
  return FULL_NAMES.get(repKey(trimmed)) ?? trimmed;
};

const ROSTER_TEAM: Record<string, B2BTeam | undefined> = { KAM: 'kam', Inbound: 'inbound', Outbound: 'outreach' };

export function buildRepTeams(members: Pick<TeamMember, 'name' | 'team' | 'active'>[]): RepTeams {
  const out: RepTeams = new Map();
  const add = (name: string, team: B2BTeam | undefined) => {
    if (!team) return;
    const key = repKey(repName(name));
    const held = out.get(key) ?? [];
    if (!held.includes(team)) out.set(key, [...held, team]);
  };
  for (const m of members) if (m.active) add(m.name, m.team);
  for (const r of B2B_ROSTER) add(r.fullName, ROSTER_TEAM[r.role]);
  return out;
}

export const teamsOfRep = (name: unknown, reps: RepTeams): B2BTeam[] => reps.get(repKey(repName(name))) ?? [];

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const contactNumbers = (meta: Record<string, unknown>): unknown[] => {
  const contacts = Array.isArray(meta.contacts) ? meta.contacts as { number?: unknown }[] : [];
  const additional = Array.isArray(meta.additional_contacts) ? meta.additional_contacts as { phone?: unknown }[] : [];
  return [
    meta.phone, meta.alt_phone, meta.primary_contact_phone,
    ...contacts.map((c) => c.number),
    ...additional.map((c) => c.phone),
  ];
};

const day = (v: unknown): string => String(v ?? '').slice(0, 10);

const SPOC_TEAMS: Record<string, B2BTeam | undefined> = { inbound: 'inbound', outreach: 'outreach' };

function spocHolders(row: B2BSourceRow, firm: string): Holder[] {
  const log = Array.isArray(row.meta_data?.spoc_log) ? row.meta_data.spoc_log as { role?: string; name?: string; from?: string }[] : [];
  return log.flatMap((e) => {
    const team = SPOC_TEAMS[String(e.role)];
    return team && text(e.name) ? [{ kind: team as HolderKind, team, owner: repName(e.name), firm, since: day(e.from) }] : [];
  });
}

export function clientDbFirms(rows: B2BSourceRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of rows) {
    if (row.pipeline !== 'client') continue;
    const meta = row.meta_data ?? {};
    const firm = text(meta.company) || text(meta.firm_name);
    for (const n of contactNumbers(meta)) {
      const phone = phoneOf(n);
      if (phone && !out.has(phone)) out.set(phone, firm);
    }
  }
  return out;
}

function holderOf(row: B2BSourceRow): Holder | null {
  const meta = row.meta_data ?? {};
  const owner = repName(row.owner);
  const firm = text(meta.company) || text(meta.firm_name);
  if (row.pipeline === 'client') {
    return owner
      ? { kind: 'firm', team: 'kam', owner, firm, since: '' }
      : { kind: 'unowned', team: null, owner: '', firm, since: '' };
  }
  if (row.pipeline === 'kam') return { kind: 'firm', team: 'kam', owner, firm, since: '' };
  if (row.pipeline === 'outbound') return { kind: 'outreach', team: 'outreach', owner, firm, since: day(row.created_at) };
  if (row.pipeline === 'inbound' && row.stage !== 'Invalid') return { kind: 'inbound', team: 'inbound', owner, firm, since: day(row.created_at) };
  return null;
}

const firmHolderOf = (book: NumberBook, phone: string): Holder | undefined =>
  (book.get(phone) ?? []).find((h) => h.kind === 'firm');

export function buildNumberBook(rows: B2BSourceRow[], studio: StudioFirm[] | null, redirects: RedirectInput[]): NumberBook {
  const book: NumberBook = new Map();
  const hold = (raw: unknown, holder: Holder) => {
    const phone = phoneOf(raw);
    if (phone) book.set(phone, [...(book.get(phone) ?? []), holder]);
  };

  for (const row of rows) {
    const holder = holderOf(row);
    if (!holder) continue;
    const held = row.pipeline === 'client' ? [holder, ...spocHolders(row, holder.firm)] : [holder];
    for (const n of contactNumbers(row.meta_data ?? {})) for (const h of held) hold(n, h);
  }

  for (const f of studio ?? []) {
    const firm = f.phones.map((p) => firmHolderOf(book, phoneOf(p))).find(Boolean);
    const owned = { team: 'kam' as const, owner: firm?.owner ?? '', firm: f.firm_name };
    const ownNumber: Holder = { kind: 'studio', ...owned, since: '' };
    const referredNumber: Holder = { kind: 'referred', ...owned, since: '' };
    for (const p of f.phones) hold(p, ownNumber);
    for (const r of f.referrals) {
      if (r.status === 'approved') hold(r.phone, { ...referredNumber, since: day(r.referred_on) });
    }
    const listed = new Set(f.referrals.map((r) => phoneOf(r.phone)));
    for (const o of f.orders) {
      if (!listed.has(phoneOf(o.phone))) hold(o.phone, o.source === 'client' ? referredNumber : ownNumber);
    }
  }

  for (const r of redirects) {
    const holder: Holder = { kind: 'redirect', team: r.sourceTeam ?? null, owner: repName(r.scheduledBy), firm: r.firm, since: day(r.createdAt) };
    for (const p of r.phones) hold(p, holder);
  }

  for (const held of book.values()) held.sort((a, b) => HOLDER_RANK[a.kind] - HOLDER_RANK[b.kind]);
  return book;
}
