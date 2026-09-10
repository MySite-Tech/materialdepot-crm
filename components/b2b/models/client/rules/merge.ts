import { Segment } from '../../inbound';
import { MERGE_FIELDS } from '../../../constants/client';
import { ClientContact, ClientEntity, ClientEntityType, ClientGst, ClientSource, MergeChoices, MergeConflict, MergeField, MergeResult } from '../../../types/client';
import { normalizeContactNumber, normalizeGst, primaryContact } from '../../utils/client';
const mergeValue = (c: ClientEntity, f: MergeField): string => {
  switch (f) {
    case 'company': return String(c.company || '').trim();
    case 'segment': return String(c.segment || '');
    case 'clientType': return String(c.clientType || '');
    case 'kam': return String(c.kam || '');
    case 'source': return String(c.source || '');
  }
};

export function mergeConflicts(sources: ClientEntity[]): MergeConflict[] {
  const out: MergeConflict[] = [];
  for (const field of MERGE_FIELDS) {
    const byValue = new Map<string, string[]>();
    for (const c of sources) {
      const v = mergeValue(c, field);
      if (!v) continue;
      byValue.set(v, [...(byValue.get(v) || []), c.company || c.id]);
    }
    if (byValue.size > 1) {
      out.push({ field, options: [...byValue.entries()].map(([value, from]) => ({ value, from })) });
    }
  }
  return out;
}

export function mergeClients(
  sources: ClientEntity[],
  choices: MergeChoices,
  by: string | undefined,
  now: string = new Date().toISOString(),
): MergeResult {
  if (sources.length < 2) throw new Error('A merge needs at least two client records.');

  const ordered = [...sources].sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || a.id.localeCompare(b.id));
  const keep = ordered[0];
  const absorbed = ordered.slice(1);

  const contacts: ClientContact[] = [];
  const byNumber = new Map<string, ClientContact>();
  for (const c of ordered) {
    for (const contact of c.contacts || []) {
      const key = normalizeContactNumber(contact.number);
      if (!key) continue;
      const existing = byNumber.get(key);
      if (!existing) {
        const next: ClientContact = { ...contact, number: key, primary: false };
        byNumber.set(key, next);
        contacts.push(next);
      } else {
        if (!existing.name && contact.name) existing.name = contact.name;
        if (!existing.label && contact.label) existing.label = contact.label;
      }
    }
  }
  const keepPrimary = normalizeContactNumber(primaryContact(keep.contacts)?.number);
  const primary = contacts.find((c) => c.number === keepPrimary) || contacts[0];
  if (primary) primary.primary = true;

  const gsts: ClientGst[] = [];
  const byGst = new Map<string, ClientGst>();
  for (const c of ordered) {
    for (const g of c.gsts || []) {
      const key = normalizeGst(g.number);
      if (!key) continue;
      const existing = byGst.get(key);
      if (!existing) {
        const next: ClientGst = { ...g, number: key };
        byGst.set(key, next);
        gsts.push(next);
      } else if (!existing.registeredName && g.registeredName) {
        existing.registeredName = g.registeredName;
        existing.validatedAt = g.validatedAt;
      }
    }
  }

  const pick = <T extends string>(field: MergeField, fallback: T | undefined): T | undefined => {
    const chosen = (choices as Record<string, string | undefined>)[field];
    if (chosen) return chosen as T;
    const values = new Set(ordered.map((c) => mergeValue(c, field)).filter(Boolean));
    if (values.size === 1) return [...values][0] as T;
    return fallback;
  };

  const merged: ClientEntity = {
    ...keep,
    company: pick<string>('company', keep.company) || keep.company,
    contacts,
    gsts,
    segment: pick<Segment>('segment', keep.segment),
    clientType: pick<ClientEntityType>('clientType', keep.clientType),
    kam: pick<string>('kam', keep.kam),
    source: (pick<ClientSource>('source', keep.source) || 'Existing') as ClientSource,

    interactions: ordered.flatMap((c) => c.interactions || []),
    escalations: ordered.flatMap((c) => c.escalations || []),
    assignments: ordered.flatMap((c) => c.assignments || [])
      .sort((a, b) => String(a.at).localeCompare(String(b.at))),
    remarks: ordered.map((c) => String(c.remarks || '').trim()).filter(Boolean).join(' · ') || undefined,
    mergedFrom: [
      ...(keep.mergedFrom || []),
      ...absorbed.flatMap((c) => c.mergedFrom || []),
      ...absorbed.map((c) => ({ id: c.id, company: c.company, mergedAt: now, mergedBy: by })),
    ],
    updatedAt: now,
  };

  return { merged, absorbed };
}

