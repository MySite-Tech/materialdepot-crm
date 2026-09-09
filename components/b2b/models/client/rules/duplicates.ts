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

  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const A = prepared[i];
      const B = prepared[j];
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
  }

  const rank = (s: DuplicateSuggestion) =>
    (s.evidence.some((e) => EVIDENCE_IS_EXACT[e]) ? 0 : 1) * 10 - s.evidence.length;
  return out.sort((x, y) => rank(x) - rank(y));
}

