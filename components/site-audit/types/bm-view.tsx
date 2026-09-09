'use client';

import { JourneyEntry } from '../data/auditRegistry';

export type BmProfile = { id?: string | number; name: string; email?: string; contact?: string; role?: string; aliases?: string[] };

export type Order = {
  id: string; pi: string; po: string[]; bm: string; name: string; phone: string; addr: string;
  status: string; slot: string | null; date: string | null; auditorName: string | null; log: any[];
  createdAt: string | null;

  journey: JourneyEntry[];
  coePlaced: { at: string; ref?: string } | null;
};
