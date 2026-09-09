'use client';

import { InstallOrder, Subjob } from '../../install-ops/types';

type AuditSource = 'material_depot' | 'customer' | null;

export type OwnedInstall = {
  id: string; pi: string; po: string[]; bm: string; name: string; phone: string; addr: string;
  status: string; deliveryDate: string | null; customWp: boolean; city: string;
  createdAt: string | null;
  auditBy: AuditSource;
  subjobs: Subjob[];
};

export type InstallExtras = { log: any[]; service: InstallOrder['service']; skus: any[] } | null;
