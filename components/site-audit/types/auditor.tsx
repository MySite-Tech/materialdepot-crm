'use client';

import { SketchStroke } from '@/components/site-audit/apps/fieldAppShared';
import { AdjustRow, FieldValues, PrereqEntry } from '@/components/site-audit/data/auditRegistry';

export type ActingAs = { id: string; name: string; email: string };

type SkuItem = { c: string; n?: string; type?: string; audit?: boolean };

export type LogEntry = {
  t: string;
  d: string;
  by: string;
  who: string;
  arrivalPhoto?: string | null;
  lat?: number | null;
  lng?: number | null;

  locOverride?: boolean;
};

export type LogExtra = Partial<Pick<LogEntry, 'arrivalPhoto' | 'lat' | 'lng' | 'locOverride'>>;

export type Segment = {
  sid: number;
  facing: string | null;
  photos: string[];
  fields: FieldValues;
  prereq: Record<string, PrereqEntry>;
  adjust: AdjustRow[];
};

export type Room = {
  id: number;

  v: number;
  category: string;
  name: string;
  sku: string;
  variant: string | null;
  notes: string;
  segments: Segment[];
  nextSid: number;
  sketchStrokes: SketchStroke[];
};

export type SignData = {
  img: string;
  name: string;

  ratings?: { q1: number; q2: number; q3: number; comments: string };
  tcCategories?: string[];
};

export type JobCard = { rooms: any[]; sign?: SignData | null };

export type Order = {
  id: string;
  pi: string;

  po: string | null;
  name: string;
  phone: string;
  addr: string;
  bm: string;
  date: string | null;
  slot: string | null;
  status: string;
  skus: SkuItem[];
  log: LogEntry[];
  jobcard: JobCard | null;
  service?: Record<string, any> | null;
};

export type RoomPatch = Partial<Room> | ((r: Room) => Partial<Room>);

export type WizardPhase = 'rooms' | 'review' | 'pass' | 'terms' | 'sign' | 'done';

export type Screen = { name: 'list' } | { name: 'detail'; pi: string } | { name: 'jobcard'; pi: string };
