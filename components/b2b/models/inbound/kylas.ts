import { Selection } from '../../types/inbound';
import { KYLAS_CLIENT_TYPE_MAP, SELECTION_KYLAS_LABEL } from '../../constants/inbound';
import { ClientType, InboundLocation } from '../../types/inbound';

export function locationFromPincode(pincode: string | undefined): InboundLocation | undefined {
  const head = Number(String(pincode || '').replace(/\D/g, '').slice(0, 3));
  if (!head) return undefined;
  if (head >= 500 && head <= 509) return 'Hyderabad';
  if (head >= 560 && head <= 591) return 'Bangalore';
  return undefined;
}

export function clientTypeFromKylas(raw: string | undefined): ClientType | undefined {
  return KYLAS_CLIENT_TYPE_MAP[String(raw || '').trim().toLowerCase()];
}

export function kylasClientTypeIsAmbiguous(raw: string | undefined): boolean {
  const v = String(raw || '').trim();
  return !!v && !clientTypeFromKylas(v);
}

export function selectionsToKylasLabels(sel: string[] | undefined): string[] {
  return (sel || [])
    .map((s) => SELECTION_KYLAS_LABEL[s as Selection])
    .filter((s): s is string => !!s);
}

export function selectionsFromKylasLabels(labels: string[] | undefined): Selection[] {
  const inverse = new Map(
    Object.entries(SELECTION_KYLAS_LABEL).map(([ours, theirs]) => [theirs, ours as Selection]),
  );
  return (labels || []).map((l) => inverse.get(l)).filter((s): s is Selection => !!s);
}

export function selectionsKylasWillDrop(sel: string[] | undefined): string[] {
  return (sel || []).filter((s) => !SELECTION_KYLAS_LABEL[s as Selection]);
}

