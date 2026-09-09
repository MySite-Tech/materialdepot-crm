import { fetchKamOrders } from './reads';
import { rowToInbound } from './inboundMapper';
import { rowToOutreach } from './outreachMapper';
import { fetchRows } from './reads';
import { ClientEntity, ClientEntityType, ClientSource, clientTypeFromLead, contactNumbers, normalizeContactNumber, normalizeGst } from '@/components/b2b/models/clientModel';
import { Segment } from '@/components/b2b/models/inboundModel';
import { KamOrder } from '@/components/b2b/models/kamModel';
import { InboundLead, OutreachLead } from '@/components/b2b/models/mockData';
// ── Seeding the client universe (Client DB open question #4) ──────────────────
//
// "Is there a Procurement export needed to seed Order Details for clients who
// ordered before this module existed?"
//
// No — Order Details is derived from the deal tickets, which already hold every
// historical order. What DOES need seeding is the entity list itself, and the
// CRM already knows about every client it has closed: a won Inbound lead, a won
// Outreach lead, and the 30 legacy KAM rows each name a company and a phone.
//
// `planClientSeed` proposes entities from those and is never run automatically.
// Matching is EXACT on the normalized phone — a company-name similarity is
// reported as a possible duplicate for the merge screen instead, because two
// firms with similar names are not one client and a seed that guessed would
// silently fuse two books of business.

export interface ClientSeedCandidate {
  company: string;
  phone: string;
  contactName?: string;
  gstNumber?: string;
  segment?: Segment;
  clientTypeRaw?: string;
  clientType?: ClientEntityType;
  source: ClientSource;
  kam?: string;
  /** Where the candidate came from, for the preview. */
  origin: 'Inbound lead' | 'Outreach lead' | 'KAM board';
  /** Set when an existing client already holds this phone. */
  existingClientId?: string;
  existingCompany?: string;
}

export interface ClientSeedPlan {
  create: ClientSeedCandidate[];
  /** Already covered by a client entity — nothing to do. */
  alreadyLinked: ClientSeedCandidate[];
  /** Named a company but no usable phone, so nothing could link its orders. */
  unusable: ClientSeedCandidate[];
}

export async function planClientSeed(existing: ClientEntity[]): Promise<ClientSeedPlan> {
  const [inbound, outreach, kamOrders] = await Promise.all([
    fetchRows('inbound').then((rows) => rows.map(rowToInbound)).catch(() => [] as InboundLead[]),
    fetchRows('outbound').then((rows) => rows.map(rowToOutreach)).catch(() => [] as OutreachLead[]),
    fetchKamOrders().catch(() => [] as KamOrder[]),
  ]);

  const byPhone = new Map<string, ClientEntity>();
  for (const c of existing) {
    for (const p of contactNumbers(c.contacts)) if (!byPhone.has(p)) byPhone.set(p, c);
  }

  const raw: ClientSeedCandidate[] = [];

  for (const l of inbound) {
    if (l.stage !== 'Closed') continue;
    raw.push({
      company: String(l.companyName || l.company || '').trim(),
      phone: normalizeContactNumber(l.phone),
      contactName: l.contactName || undefined,
      gstNumber: l.gstNumber || undefined,
      segment: l.segment,
      clientTypeRaw: l.clientType || l.presalesClientType || undefined,
      clientType: clientTypeFromLead(l.clientType),
      source: 'Inbound',
      kam: l.kam || undefined,
      origin: 'Inbound lead',
    });
  }

  for (const l of outreach) {
    if (l.status !== 'Closed') continue;
    raw.push({
      company: String(l.company || '').trim(),
      phone: normalizeContactNumber(l.phone),
      contactName: l.contactPerson || undefined,
      gstNumber: l.gstNumber || undefined,
      segment: l.segment,
      clientTypeRaw: l.companyType || undefined,
      clientType: clientTypeFromLead(l.companyType),
      source: 'Outreach',
      kam: l.kam || undefined,
      origin: 'Outreach lead',
    });
  }

  for (const o of kamOrders) {
    raw.push({
      company: String(o.company || '').trim(),
      phone: normalizeContactNumber(o.phone),
      contactName: o.contactName || undefined,
      source: o.source,
      kam: o.kam || undefined,
      origin: 'KAM board',
    });
  }

  // One candidate per phone. The first origin wins for the source (leads are
  // listed before the KAM board precisely so a client's real source survives),
  // and every later candidate only fills fields the first one left blank.
  const merged = new Map<string, ClientSeedCandidate>();
  const unusable: ClientSeedCandidate[] = [];
  for (const cand of raw) {
    if (!cand.company) continue;
    if (cand.phone.length !== 10) { unusable.push(cand); continue; }
    const prev = merged.get(cand.phone);
    if (!prev) { merged.set(cand.phone, { ...cand }); continue; }
    prev.contactName ||= cand.contactName;
    prev.gstNumber ||= cand.gstNumber;
    prev.segment ||= cand.segment;
    prev.clientType ||= cand.clientType;
    prev.clientTypeRaw ||= cand.clientTypeRaw;
    prev.kam ||= cand.kam;
  }

  const create: ClientSeedCandidate[] = [];
  const alreadyLinked: ClientSeedCandidate[] = [];
  for (const cand of merged.values()) {
    const hit = byPhone.get(cand.phone);
    if (hit) {
      alreadyLinked.push({ ...cand, existingClientId: hit.id, existingCompany: hit.company });
    } else {
      create.push(cand);
    }
  }

  create.sort((a, b) => a.company.localeCompare(b.company));
  return { create, alreadyLinked, unusable };
}

export function clientFromSeed(c: ClientSeedCandidate, now = new Date().toISOString()): ClientEntity {
  return {
    id: `CLI-${Date.now()}-${c.phone}`,
    company: c.company,
    contacts: [{ number: c.phone, name: c.contactName, primary: true }],
    gsts: c.gstNumber ? [{ number: normalizeGst(c.gstNumber) }] : [],
    segment: c.segment,
    clientType: c.clientType,
    clientTypeRaw: c.clientType ? undefined : c.clientTypeRaw,
    source: c.source,
    kam: c.kam,
    assignments: c.kam ? [{ kam: c.kam, at: now, reason: `Seeded from ${c.origin}` }] : [],
    interactions: [],
    escalations: [],
    createdAt: now,
    updatedAt: now,
  };
}

