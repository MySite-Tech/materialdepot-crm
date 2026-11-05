import { EVIDENCE_IS_EXACT } from '../../../constants/client';
import { gstNumbers } from './gst';
import { ClientEntity, DuplicateEvidence, DuplicateSuggestion } from '../../../types/client';
import { contactNumbers, normalizeCompanyName, overlap } from '../../utils/client';
export function findDuplicates(clients: ClientEntity[]): DuplicateSuggestion[] {
  const out: DuplicateSuggestion[] = [];
  const prepared = clients.map((c) => ({
    c,
    phones: contactNumbers(c.contacts),
    gsts: gstNumbers(c.gsts),
    pans: gstNumbers(c.gsts).map((g) => g.slice(2, 12)).filter((p) => p.length === 10),
    name: normalizeCompanyName(c.company),
  }));

  const holders = new Map<string, number[]>();
  prepared.forEach((p, i) => {
    const keys = [...p.phones.map((k) => `phone:${k}`), ...p.gsts.map((k) => `gst:${k}`), ...p.pans.map((k) => `pan:${k}`), ...(p.name ? [`name:${p.name}`] : [])];
    for (const key of new Set(keys)) {
      const list = holders.get(key);
      if (list) list.push(i); else holders.set(key, [i]);
    }
  });
  const n = prepared.length;
  const pairs = new Set<number>();
  for (const list of holders.values()) {
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) pairs.add(list[x] * n + list[y]);
  }

  for (const pair of [...pairs].sort((x, y) => x - y)) {
    const A = prepared[Math.floor(pair / n)];
    const B = prepared[pair % n];
    const evidence: DuplicateEvidence[] = [];
    const shared: string[] = [];

    const phones = overlap(A.phones, B.phones);
    if (phones.length) { evidence.push('contact'); shared.push(...phones); }

    const gsts = overlap(A.gsts, B.gsts);
    if (gsts.length) { evidence.push('gst'); shared.push(...gsts); }
    else {
      const pans = overlap(A.pans, B.pans);
      if (pans.length) { evidence.push('pan'); shared.push(...pans); }
    }

    if (A.name && A.name === B.name) { evidence.push('name'); shared.push(A.c.company); }

    if (evidence.length) out.push({ a: A.c, b: B.c, evidence, shared: [...new Set(shared)] });
  }

  const rank = (s: DuplicateSuggestion) =>
    (s.evidence.some((e) => EVIDENCE_IS_EXACT[e]) ? 0 : 1) * 10 - s.evidence.length;
  return out.sort((x, y) => rank(x) - rank(y));
}

