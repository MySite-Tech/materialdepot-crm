'use client';

export type Preset = "today" | "yesterday" | "current_week" | "current_month";

export interface TimelineEntry {
  id: number;
  event: string;
  description: string;
  performedBy: string;
  createdAt: string;
  icon: "update" | "stage" | "note" | "call" | "create" | "close";
}

export interface NoteEntry {
  description: string;
  createdAt?: string;
}

export type DateFilter = "today" | "yesterday" | "7days" | "month" | "all";

export type StatusFilter = "all" | "open" | "waiting" | "resolved";

export interface MobileEscalationProps {
  jumpToSearch?: string | null;
  userName?: string;
}
