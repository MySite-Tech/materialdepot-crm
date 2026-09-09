'use client';

import { FieldValues } from '@/components/site-audit/data/auditRegistry';

export type LogEntry = {
  t: string;
  d: string;
  by?: string;
  who?: string;
  lat?: number;
  lng?: number;
  arrivalPhoto?: string;

  locOverride?: boolean;
};

type SkuLine = { code: string; skuName: string; link: string; qty: string };

export type PersistedRoom = {
  v?: number;
  category?: string;
  name: string;
  sku: string;
  fields?: FieldValues;
  photos: string[];

  photo?: string;
  comments: string;

  qty?: string;
  height?: string;
  width?: string;
};

export type Room = PersistedRoom & { id: number };

type Ratings = { q1: number; q2: number; q3: number; comments: string };

export type JobCard = {
  draft?: boolean;

  partial?: boolean;
  rooms: PersistedRoom[];

  sign?: { img: string; name: string; ratings?: Ratings; tcCategories?: string[] };
  installerSign?: { img: string; name: string };
};

export type Job = {
  id: string;
  sjId: string;
  pi: string;
  name: string;
  phone: string;
  addr: string;
  bm: string;
  type: string;
  date: string | null;
  slot: string | null;
  slots: string[];

  status: string;

  storedStatus: string;
  sku: SkuLine[];
  auditBy: string | null;
  jobcard: JobCard | null;
  parentLog: LogEntry[];
  isPrimary: boolean;
};

export type ActingAs = { id: string; name: string; email: string };
