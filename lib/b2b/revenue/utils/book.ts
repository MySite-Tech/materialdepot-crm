import { B2B_ROSTER } from '../../../../components/b2b/models/roster';
import { HOLDER_RANK } from '../constants';
import type { B2BTeam, TeamMember } from '../../team/types';
import type { ClientGroup } from '../clients/types';
import type { B2BRepEntry, B2BSourceRow, CrmReferralInput, FirmGroups, Holder, HolderKind, NumberBook, RedirectInput, RepSpan, RepTeams, StudioFirm } from '../types';

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

const withDoubledSurname = (name: string): string[] => {
  const words = name.split(' ');
  return words.length > 1 ? [name, `${name} ${words[words.length - 1]}`] : [name];
};

type RepMember = Pick<TeamMember, 'name' | 'phone' | 'team' | 'active'> & Partial<Pick<TeamMember, 'joinedOn' | 'leftOn'>>;

const isDated = (m: RepMember) => !!(m.joinedOn || m.leftOn);

function staffAliases(members: RepMember[], staff: Pick<TeamMember, 'name' | 'phone'>[]): Map<string, string> {
  const memberByPhone = new Map(members.filter((m) => (m.active || isDated(m)) && phoneOf(m.phone))
    .sort((a, b) => Number(a.active) - Number(b.active)).map((m) => [phoneOf(m.phone), m.name]));
  const phonesByKey = new Map<string, Set<string>>();
  for (const s of staff) {
    const key = repKey(s.name);
    if (key) phonesByKey.set(key, (phonesByKey.get(key) ?? new Set()).add(phoneOf(s.phone)));
  }
  const out = new Map<string, string>();
  for (const s of staff) {
    const member = memberByPhone.get(phoneOf(s.phone));
    const key = repKey(s.name);
    if (!member || !key || phonesByKey.get(key)!.size > 1) continue;
    for (const alias of withDoubledSurname(key)) out.set(alias, member);
  }
  return out;
}

export function buildRepTeams(members: RepMember[], staff: Pick<TeamMember, 'name' | 'phone'>[] = []): RepTeams {
  const out: RepTeams = new Map();
  const dated = new Set(members.filter(isDated).map((m) => repKey(repName(m.name))));
  const add = (key: string, name: string, team: B2BTeam | undefined, span?: RepSpan) => {
    if (!team || !key) return;
    const held = out.get(key) ?? { name, teams: [] };
    const teams = held.teams.includes(team) ? held.teams : [...held.teams, team];
    out.set(key, { name: held.name, teams, ...(span || held.spans ? { spans: [...(held.spans ?? []), ...(span ? [span] : [])] } : {}) });
  };
  for (const m of members) {
    const name = repName(m.name);
    const keyed = dated.has(repKey(name));
    if (!m.active && !(keyed && isDated(m))) continue;
    const span = keyed ? { team: m.team, from: m.joinedOn ?? null, to: m.leftOn ?? null } : undefined;
    for (const key of withDoubledSurname(repKey(name))) add(key, name, m.team, span);
  }
  for (const r of B2B_ROSTER) if (!dated.has(repKey(r.fullName))) add(repKey(r.fullName), r.fullName, ROSTER_TEAM[r.role]);
  for (const [alias, member] of staffAliases(members, staff)) {
    if (out.has(alias)) continue;
    const entry = out.get(repKey(repName(member)));
    if (entry) out.set(alias, entry);
  }
  return out;
}

const onDay = (s: RepSpan, day: string) => !day || ((!s.from || day >= s.from) && (!s.to || day <= s.to));

export function repOf(name: unknown, reps: RepTeams, day = ''): (B2BRepEntry & { dated: boolean }) | undefined {
  const entry = reps.get(repKey(repName(name)));
  if (!entry) return undefined;
  if (!entry.spans) return { ...entry, dated: false };
  const teams = [...new Set(entry.spans.filter((s) => onDay(s, day)).map((s) => s.team))];
  return { ...entry, teams, dated: true };
}

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

function kamFrom(owner: string, assignments: unknown): string {
  const list = (Array.isArray(assignments) ? assignments as { kam?: unknown; at?: unknown; status?: unknown }[] : [])
    .filter((a) => text(a.at))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  let from = '';
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (a.status === 'Rejected') continue;
    if (repKey(repName(a.kam)) !== repKey(owner)) break;
    from = String(a.at);
  }
  return from;
}

function kamSince(assignments: unknown): string {
  const list = Array.isArray(assignments) ? assignments as { at?: unknown; status?: unknown }[] : [];
  return list.filter((a) => text(a.at) && a.status !== 'Rejected').map((a) => String(a.at)).sort()[0] ?? '';
}

function holderOf(row: B2BSourceRow): Holder | null {
  const meta = row.meta_data ?? {};
  const owner = repName(row.owner);
  const firm = text(meta.company) || text(meta.firm_name);
  if (row.pipeline === 'client') {
    return owner
      ? { kind: 'firm', team: 'kam', owner, firm, since: '', kamFrom: kamFrom(owner, meta.assignments), kamSince: kamSince(meta.assignments) }
      : { kind: 'unowned', team: null, owner: '', firm, since: '' };
  }
  if (row.pipeline === 'kam') return { kind: 'firm', team: 'kam', owner, firm, since: day(row.created_at) };
  if (row.pipeline === 'outbound') return { kind: 'outreach', team: 'outreach', owner, firm, since: day(row.created_at), ecReferral: !!meta.ec_referral || EC_REFERRAL_SOURCES.has(text(meta.source)) };
  if (row.pipeline === 'inbound' && row.stage !== 'Invalid') return { kind: 'inbound', team: 'inbound', owner, firm, since: day(row.created_at) };
  return null;
}

const EC_REFERRAL_SOURCES = new Set(['EC B2B Referral', 'EC referral']);

const NAME_RANK: Record<string, number> = { client: 0, studio: 1, kam: 2, outbound: 3, inbound: 4 };

const FIRM_KINDS = new Set(['client', 'kam', 'studio']);

export function firmGroups(rows: B2BSourceRow[], studio: StudioFirm[] | null): FirmGroups {
  const parent = new Map<string, string>();
  const find = (p: string): string => {
    let root = p;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(p, root);
    return root;
  };
  const records: { kind: string; name: string; phones: string[] }[] = [
    ...rows.filter((r) => holderOf(r)).map((r) => ({
      kind: r.pipeline,
      name: text(r.meta_data?.company) || text(r.meta_data?.firm_name),
      phones: contactNumbers(r.meta_data ?? {}).map(phoneOf).filter(Boolean),
    })),
    ...(studio ?? []).map((f) => ({ kind: 'studio', name: text(f.firm_name), phones: f.phones.map(phoneOf).filter(Boolean) })),
  ];
  for (const r of records) {
    for (const p of r.phones) if (!parent.has(p)) parent.set(p, p);
    for (const p of r.phones.slice(1)) {
      const [a, b] = [find(r.phones[0]), find(p)];
      if (a !== b) parent.set(b, a);
    }
  }
  const of = new Map<string, string>();
  const members = new Map<string, string[]>();
  for (const p of parent.keys()) {
    const key = `g:${find(p)}`;
    of.set(p, key);
    members.set(key, [...(members.get(key) ?? []), p]);
  }
  const names = new Map<string, string>();
  const rank = new Map<string, number>();
  const known = new Set<string>();
  for (const r of records) {
    const key = r.phones.length ? of.get(r.phones[0])! : '';
    if (!key) continue;
    if (FIRM_KINDS.has(r.kind)) known.add(key);
    const at = NAME_RANK[r.kind] ?? 9;
    if (r.name && at < (rank.get(key) ?? Infinity)) {
      names.set(key, r.name);
      rank.set(key, at);
    }
  }
  return { of, members, names, known };
}

export const firmKey = (groups: FirmGroups, phone: string): string => groups.of.get(phone) ?? `n:${phone}`;

export function clientGroups(groups: FirmGroups): Map<string, ClientGroup> {
  return new Map([...groups.of].map(([phone, key]) => [phone, { key, name: groups.names.get(key) ?? '' }]));
}

const REFERRER_PIPELINE = { inbound: 'inbound', outreach: 'outbound', client: 'client' } as const;
const REFERRER_TEAM = { inbound: 'inbound', outreach: 'outreach', client: 'kam' } as const;
const LIVE_STUDIO_REFERRAL = new Set(['approved', 'active', 'dormant']);

export function buildNumberBook(rows: B2BSourceRow[], studio: StudioFirm[] | null, redirects: RedirectInput[], referrals: CrmReferralInput[], groups: FirmGroups): NumberBook {
  const book: NumberBook = new Map();
  const hold = (raw: unknown, holder: Holder) => {
    const phone = phoneOf(raw);
    if (!phone) return;
    const held = book.get(phone) ?? [];
    if (!held.includes(holder)) book.set(phone, [...held, holder]);
  };
  const holdFirm = (numbers: unknown[], holder: Holder) => {
    const phones = new Set(numbers.map(phoneOf).filter(Boolean).flatMap((p) => groups.members.get(firmKey(groups, p)) ?? [p]));
    for (const p of phones) hold(p, holder);
  };

  for (const row of rows) {
    const holder = holderOf(row);
    if (!holder) continue;
    const held = row.pipeline === 'client' ? [holder, ...spocHolders(row, holder.firm)] : [holder];
    for (const h of held) holdFirm(contactNumbers(row.meta_data ?? {}), h);
  }

  for (const f of studio ?? []) {
    const firms = f.phones.flatMap((p) => book.get(phoneOf(p)) ?? []).filter((h) => h.kind === 'firm');
    const firm = firms.find((h) => h.kamSince !== undefined) ?? firms[0];
    const owned = { team: 'kam' as const, owner: firm?.owner ?? '', firm: f.firm_name };
    const ownNumber: Holder = { kind: 'studio', ...owned, since: day(f.onboarded_on), kamSince: firm?.kamSince ?? firm?.since };
    const referredNumber: Holder = { kind: 'referred', ...owned, since: '' };
    holdFirm(f.phones, ownNumber);
    for (const r of f.referrals) {
      if (LIVE_STUDIO_REFERRAL.has(r.status ?? '')) hold(r.phone, { ...referredNumber, since: day(r.referred_on ?? '') });
    }
    const listed = new Set(f.referrals.map((r) => phoneOf(r.phone)));
    for (const o of f.orders) {
      if (listed.has(phoneOf(o.phone))) continue;
      if (o.source === 'client') hold(o.phone, referredNumber);
      else holdFirm([o.phone], ownNumber);
    }
  }

  for (const r of referrals) {
    const row = rows.find((x) => x.pipeline === REFERRER_PIPELINE[r.referrer_kind]
      && (String(x.id ?? '') === r.referrer_id || String(x.kylas_lead_id ?? '') === r.referrer_id));
    const from = row ? holderOf(row) : null;
    hold(r.client_phone, {
      kind: 'referred', team: REFERRER_TEAM[r.referrer_kind], owner: from?.owner ?? '',
      firm: from?.firm || r.referrer_name || '', since: day(r.created_at),
    });
  }

  for (const r of redirects) {
    holdFirm(r.phones, { kind: 'redirect', team: r.sourceTeam ?? null, owner: repName(r.scheduledBy), firm: r.firm, since: day(r.createdAt) });
  }

  for (const held of book.values()) held.sort((a, b) => HOLDER_RANK[a.kind] - HOLDER_RANK[b.kind]);
  return book;
}
