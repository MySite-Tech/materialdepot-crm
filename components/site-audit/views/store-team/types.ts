'use client';

export interface SlotDef {
  id: string;
  label: string;
  rangeEnd: string;
  startMin: number;
  endMin: number;
  group: 'Morning' | 'Afternoon' | 'Evening';
}

export interface SlotContentProps {
  date: string;
  myStore: string | null;
  dayOrders: any[];
  auditorCount: number;
  capBlocked: Set<string>;
  storeCity: string;
  myRes: any[];
  allBooked: any[];
  nowMin: number | null;
  isMyBooking: (o: any) => boolean;
  cancellingId: string | null;
  onBook: (slotId: string) => void;
  onCancel: (id: string) => void;
}

export interface BookingSheetProps {
  slot: SlotDef;
  date: string;
  myStore: string;
  onClose: () => void;
  onBooked: (name: string) => void;
}
