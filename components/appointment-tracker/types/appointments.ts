'use client';

import { Branch } from '@/lib/appointments/appt-shared';

export type ShiftCode = "1" | "2" | "g" | "o" | "l" | "c";

export type RotaMember = { id: string; name: string };

export type RotaBranchData = { members: RotaMember[]; weeks: Record<string, Record<string, string>> };

export type RotaPlan = { version: 2; branches: Record<Branch, RotaBranchData> };

export type FootfallMap = Record<string, number>;

export type DatePreset = "today" | "tomorrow" | "next_7" | "this_month" | "next_week" | "next_month" | "custom";

export type DateRange = { preset: DatePreset; from: string; to: string };
