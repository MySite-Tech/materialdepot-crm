import { ClientEntity, contactNumbers } from '../models/clientModel';
import { KAM_ORDER_STATUSES, LEGACY_KAM_STAGE, QUEUE_AGE_BANDS } from '../constants/kam';
import { KamOrderStatus, LegacyKamStage } from '../types/kam';

export function normalizeKamOrderStatus(stage: string | undefined): KamOrderStatus {
  if (!stage) return 'Requirement Logged';
  if ((KAM_ORDER_STATUSES as string[]).includes(stage)) return stage as KamOrderStatus;
  return LEGACY_KAM_STAGE[stage as LegacyKamStage] ?? 'Requirement Logged';
}

export function isLegacyKamStage(stage: string | undefined): boolean {
  return !!stage && !(KAM_ORDER_STATUSES as string[]).includes(stage);
}

export const sum = (ns: (number | undefined)[]) => ns.reduce((a: number, b) => a + (Number(b) || 0), 0);

export function contactNumbersForOrder(client: ClientEntity | undefined): string[] {
  return contactNumbers(client?.contacts);
}

export function queueAgeBand(agedDays: number): typeof QUEUE_AGE_BANDS[number] {
  return QUEUE_AGE_BANDS.find((b) => agedDays <= b.max) || QUEUE_AGE_BANDS[QUEUE_AGE_BANDS.length - 1];
}

