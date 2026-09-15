import { DuplicateEvidence, ClientEntity } from '../../../types/client';
import { contactNumbers, normalizeCompanyName, normalizeContactNumber, normalizeGst } from '../../utils/client';
import { gstNumbers } from '../rules/gst';
import { FIRM_WORDS, PARENT_ID_PREFIX, PLACEHOLDER_NAMES } from './constants';
import {
  NameOnlyCandidate, NameOnlyVerdict, ParentCompany, ParentGrouping, ParentNameSource, ParentSubject,
} from './types';

export type {
  ParentSubject, ParentCompany, ParentGrouping, ParentNameSource, NameOnlyCandidate, NameOnlyVerdict,
} from './types';

export function parentSubjectFromClient(c: ClientEntity): ParentSubject {
  return {
    id: c.id,
    company: c.company,
    contactPerson: c.contacts?.find((x) => x.primary)?.name || c.contacts?.[0]?.name,
    phones: contactNumbers(c.contacts),
    gsts: gstNumbers(c.gsts),
  };
}

function panOf(gst: string): string {
  const pan = gst.slice(2, 12);
  return pan.length === 10 ? pan : '';
}

class Groups {
  private parent = new Map<string, string>();

  find(x: string): string {
    let root = this.parent.get(x) ?? x;
    if (root === x) { this.parent.set(x, x); return x; }
    root = this.find(root);
    this.parent.set(x, root);
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function pickName(members: ParentSubject[]): { name: string; nameFrom: ParentNameSource } {
  const named = members.filter((m) => m.company.trim());
  if (!named.length) return { name: '(no company name)', nameFrom: 'none' };

  const tally = (list: ParentSubject[]) => {
    const counts = new Map<string, number>();
    for (const m of list) counts.set(m.company, (counts.get(m.company) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
  };

  const firm = named.filter((m) => FIRM_WORDS.test(m.company));
  if (firm.length) return { name: tally(firm), nameFrom: 'firm-suffix' };

  const notSelf = named.filter(
    (m) => m.company.trim().toLowerCase() !== String(m.contactPerson || '').trim().toLowerCase(),
  );
  if (notSelf.length) return { name: tally(notSelf), nameFrom: 'differs-from-contact' };

  return { name: tally(named), nameFrom: 'most-frequent' };
}

function readNameOnly(members: ParentSubject[], normalized: string): {
  readsAs: NameOnlyCandidate['readsAs']; verdict: NameOnlyVerdict; reason: string;
} {
  const phones = new Set(members.flatMap((m) => m.phones));
  const gsts = new Set(members.flatMap((m) => m.gsts));
  const people = new Set(
    members.map((m) => String(m.contactPerson || '').trim().toLowerCase()).filter(Boolean),
  );
  const selfNamed = members.filter(
    (m) => m.company.trim().toLowerCase() === String(m.contactPerson || '').trim().toLowerCase(),
  ).length;

  if (PLACEHOLDER_NAMES.has(normalized)) {
    return { readsAs: 'placeholder', verdict: 'placeholder', reason: 'Placeholder text, not a company name.' };
  }

  const organisation = FIRM_WORDS.test(normalized)
    || normalized.split(' ').length > 1
    || (people.size > 1 && selfNamed * 2 < members.length);

  if (gsts.size > 1) {
    return {
      readsAs: organisation ? 'organisation' : 'individual',
      verdict: 'different-gsts',
      reason: `${gsts.size} different GST numbers, so these are different legal entities.`,
    };
  }
  if (!organisation) {
    return {
      readsAs: 'individual',
      verdict: 'person-like',
      reason: `One person-like name on ${phones.size} different phone numbers.`,
    };
  }
  return {
    readsAs: 'organisation',
    verdict: 'undecidable',
    reason: `Organisation name with ${people.size} contact people over ${phones.size} phones; plausibly one company, but no shared GST or phone proves it.`,
  };
}

export function groupIntoParents(subjects: ParentSubject[]): ParentGrouping {
  const clean = subjects.map((s) => ({
    ...s,
    phones: [...new Set(s.phones.map(normalizeContactNumber).filter((p) => p.length === 10))],
    gsts: [...new Set(s.gsts.map(normalizeGst).filter(Boolean))],
  }));

  const groups = new Groups();
  const byKey = new Map<string, string[]>();
  const push = (key: string, id: string) => {
    const list = byKey.get(key);
    if (list) list.push(id); else byKey.set(key, [id]);
  };

  for (const s of clean) {
    groups.find(s.id);
    for (const p of s.phones) push(`phone:${p}`, s.id);
    for (const g of s.gsts) {
      push(`gst:${g}`, s.id);
      const pan = panOf(g);
      if (pan) push(`pan:${pan}`, s.id);
    }
  }

  for (const ids of byKey.values()) {
    for (let i = 1; i < ids.length; i++) groups.union(ids[0], ids[i]);
  }

  const buckets = new Map<string, ParentSubject[]>();
  for (const s of clean) {
    const root = groups.find(s.id);
    const bucket = buckets.get(root);
    if (bucket) bucket.push(s); else buckets.set(root, [s]);
  }

  const shared = (key: string) => (byKey.get(key) || []).length > 1;

  const ordered = [...buckets.values()].sort(
    (a, b) => b.length - a.length || pickName(a).name.localeCompare(pickName(b).name),
  );

  const parentOf = new Map<string, string>();
  const parents: ParentCompany[] = ordered.map((members, i) => {
    const id = `${PARENT_ID_PREFIX}-${String(i + 1).padStart(4, '0')}`;
    for (const m of members) parentOf.set(m.id, id);

    const phones = [...new Set(members.flatMap((m) => m.phones))];
    const gsts = [...new Set(members.flatMap((m) => m.gsts))];
    const linkedBy: DuplicateEvidence[] = [];
    if (phones.some((p) => shared(`phone:${p}`))) linkedBy.push('contact');
    if (gsts.some((g) => shared(`gst:${g}`))) linkedBy.push('gst');
    if (gsts.some((g) => panOf(g) && shared(`pan:${panOf(g)}`) && !shared(`gst:${g}`))) linkedBy.push('pan');

    return {
      id,
      ...pickName(members),
      memberIds: members.map((m) => m.id),
      names: [...new Set(members.map((m) => m.company).filter(Boolean))],
      phones,
      gsts,
      pans: [...new Set(gsts.map(panOf).filter(Boolean))],
      linkedBy,
    };
  });

  const byName = new Map<string, ParentSubject[]>();
  for (const s of clean) {
    const n = normalizeCompanyName(s.company);
    if (!n) continue;
    const list = byName.get(n);
    if (list) list.push(s); else byName.set(n, [s]);
  }

  const nameOnly: NameOnlyCandidate[] = [];
  for (const [name, members] of byName) {
    const ids = [...new Set(members.map((m) => parentOf.get(m.id) as string))];
    if (ids.length < 2) continue;
    nameOnly.push({
      name,
      subjectCount: members.length,
      parentIds: ids.sort(),
      phoneCount: new Set(members.flatMap((m) => m.phones)).size,
      gstCount: new Set(members.flatMap((m) => m.gsts)).size,
      contactPeople: new Set(
        members.map((m) => String(m.contactPerson || '').trim().toLowerCase()).filter(Boolean),
      ).size,
      ...readNameOnly(members, name),
    });
  }
  nameOnly.sort((a, b) => b.parentIds.length - a.parentIds.length || b.subjectCount - a.subjectCount);

  return {
    parents,
    nameOnly,
    unlinkable: clean.filter((s) => !s.phones.length && !s.gsts.length).map((s) => s.id),
  };
}
