import { validateGst } from './gst';
import { ClientEntity } from '../../../types/client';
import { contactNumbers, isValidContactNumber } from '../../utils/client';

export function clientGateErrors(c: Partial<ClientEntity>): string[] {
  const errs: string[] = [];
  if (!String(c.company || '').trim()) errs.push('A company name is required.');
  const numbers = contactNumbers(c.contacts);
  if (!numbers.length) errs.push('At least one valid 10-digit contact number is required — it is the only thing that links orders to this client.');
  const bad = (c.contacts || []).filter((x) => String(x.number || '').trim() && !isValidContactNumber(x.number));
  if (bad.length) errs.push(`${bad.length} contact number${bad.length === 1 ? '' : 's'} ${bad.length === 1 ? 'is' : 'are'} not a valid 10-digit Indian mobile number.`);
  if (!c.segment) errs.push('A segment (1, 2 or 3) is required.');
  if (!c.clientType) errs.push('A client type is required.');
  for (const g of c.gsts || []) {
    const v = validateGst(g.number);
    if (!v.storable) errs.push(`GST "${g.number}": ${v.message}`);
  }
  return errs;
}

export function clientEnrichmentGaps(c: ClientEntity): string[] {
  const gaps: string[] = [];
  if (!(c.gsts || []).length) gaps.push('No GST on file');
  if (!(c.contacts || []).some((x) => String(x.name || '').trim())) gaps.push('No contact person named');
  if (!c.kam) gaps.push('No KAM assigned');
  const withChecksumWarning = (c.gsts || []).filter((g) => validateGst(g.number).check === 'bad-checksum');
  if (withChecksumWarning.length) gaps.push(`${withChecksumWarning.length} GST check digit${withChecksumWarning.length === 1 ? '' : 's'} disagree`);
  return gaps;
}
