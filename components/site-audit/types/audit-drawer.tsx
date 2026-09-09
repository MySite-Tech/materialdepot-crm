'use client';

import { ShadowerOption } from '../install-ops/ShadowerSelect';
import { AuditOrder, Auditor, SlotDef } from '../audit-ops/shared';

export type BmOption = { name: string; email?: string; contact?: string };

export interface Props {
  order: AuditOrder;
  orders: AuditOrder[];
  auditors: Auditor[];
  slots: SlotDef[];
  shadowerPool: ShadowerOption[];
  bmOptions: BmOption[];
  attribution: string;

  auditorsErr?: boolean;
  onRetryAuditors?: () => void;
  onClose: () => void;
  reload: () => Promise<void>;
  reloadWithDeleted: () => Promise<void>;
  onOpenOrder: (pi: string) => void;
  onRaiseRect: (o: AuditOrder) => void;
  toast: (m: string) => void;
}
