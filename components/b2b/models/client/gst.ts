import { GSTIN_SHAPE, GST_STATE_NAMES } from '../../constants/client';
import { ClientGst, GstValidation } from '../../types/client';
import { gstCheckDigit, normalizeGst } from '../../utils/client';
export function validateGst(raw: string | undefined): GstValidation {
  const normalized = normalizeGst(raw);
  if (!normalized) return { check: 'empty', normalized, storable: true };

  if (!GSTIN_SHAPE.test(normalized)) {
    return {
      check: 'bad-format',
      normalized,
      storable: false,
      message: normalized.length === 15
        ? 'Right length, wrong shape — a GSTIN is 2 digits, 5 letters, 4 digits, a letter, one character, "Z", then a check character.'
        : `A GSTIN is 15 characters; this is ${normalized.length}.`,
    };
  }

  const stateCode = normalized.slice(0, 2);
  const stateName = GST_STATE_NAMES[stateCode];
  const pan = normalized.slice(2, 12);

  if (!stateName) {
    return {
      check: 'unknown-state',
      normalized, stateCode, pan,
      storable: false,
      message: `"${stateCode}" is not a GST state code (01–38, 97, 99).`,
    };
  }

  const expected = gstCheckDigit(normalized.slice(0, 14));
  if (expected && expected !== normalized[14]) {
    return {
      check: 'bad-checksum',
      normalized, stateCode, stateName, pan,
      storable: true,
      message: `Check character should be "${expected}", not "${normalized[14]}" — worth re-reading off the certificate.`,
    };
  }

  return { check: 'valid', normalized, stateCode, stateName, pan, storable: true };
}

export function gstNumbers(gsts: ClientGst[] | undefined): string[] {
  const seen = new Set<string>();
  for (const g of gsts || []) {
    const n = normalizeGst(g.number);
    if (n) seen.add(n);
  }
  return [...seen];
}

