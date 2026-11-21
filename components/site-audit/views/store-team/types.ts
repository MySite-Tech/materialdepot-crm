'use client';

import type { StoreSlot } from '@/lib/api';

export interface SlotDef {
  id: string;
  label: string;
  rangeEnd: string;
  startMin: number;
  endMin: number;
  group: 'Morning' | 'Afternoon' | 'Evening';
}

export type OverrideLevel = 'admin' | 'sm' | null;

export interface Overrider {
  level: OverrideLevel;
  name: string;
}

export interface SlotContentProps {
  date: string;
  myStore: string | null;
  poolLabel: string;
  windows: SlotDef[];
  daySlots: Map<string, StoreSlot> | null;
  overrider: Overrider;
  myRes: any[];
  allBooked: any[];
  nowMin: number | null;
  isMyBooking: (o: any) => boolean;
  dayOrders: any[];
  cancellingId: string | null;
  onBook: (slotId: string, overrideNote?: string) => void;
  onCancel: (id: string) => void;
}

export interface BookingSheetProps {
  slot: SlotDef;
  date: string;
  myStore: string;
  overrideNote?: string;
  onClose: () => void;
  onBooked: (name: string) => void;
}
