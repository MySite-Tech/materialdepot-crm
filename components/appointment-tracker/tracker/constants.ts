'use client';

import { DatePreset, ShiftCode } from '../types';

export const SLOTS: { key: string; label: string; startH: number; endH: number }[] = [
  { key: "s1", label: "10 AM – 12 PM", startH: 10, endH: 12 },
  { key: "s2", label: "12 PM – 2 PM",  startH: 12, endH: 14 },
  { key: "s3", label: "2 PM – 4 PM",   startH: 14, endH: 16 },
  { key: "s4", label: "4 PM – 6 PM",   startH: 16, endH: 18 },
  { key: "s5", label: "6 PM – 8 PM",   startH: 18, endH: 20 },
  { key: "s6", label: "8 PM – 9 PM",   startH: 20, endH: 21 },
];

export const DOW_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const SHIFT_META: Record<ShiftCode, { label: string; short: string; dot: string; bg: string }> = {
  "1": { label: "1st Shift",     short: "1st",  dot: "bg-indigo-500",  bg: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "2": { label: "2nd Shift",     short: "2nd",  dot: "bg-sky-500",     bg: "bg-sky-50 text-sky-700 border-sky-200" },
  "g": { label: "General Shift", short: "Gen",  dot: "bg-amber-500",   bg: "bg-amber-50 text-amber-700 border-amber-200" },
  "o": { label: "Week Off",      short: "Off",  dot: "bg-gray-400", bg: "bg-gray-100 text-gray-600 border-gray-200" },
  "l": { label: "Leave",         short: "Leave",dot: "bg-rose-500",    bg: "bg-rose-50 text-rose-700 border-rose-200" },
  "c": { label: "Comp Off",      short: "Comp", dot: "bg-emerald-500", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export const SHIFT_ORDER: ShiftCode[] = ["1", "2", "g", "o", "l", "c"];

export const SHIFT_HOURS: Record<"1" | "2" | "g", { weekday: [number, number]; weekend: [number, number] }> = {
  "1": { weekday: [10, 19],   weekend: [10, 20] },   // 10 AM – 7 PM weekday / 10 AM – 8 PM weekend
  "2": { weekday: [12, 21],   weekend: [11, 21] },   // 12 PM – 9 PM weekday / 11 AM – 9 PM weekend
  "g": { weekday: [9.5, 21],  weekend: [9.5, 21] },  // 9:30 AM – 9 PM — spans the whole day
};

export const ROTA_PAST_DAYS = 60;

export const ROTA_FUTURE_DAYS = 180;

export const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  next_7: "Next 7 days",
  this_month: "Current month",
  next_week: "Next week",
  next_month: "Next month",
  custom: "Custom",
};

export const CHIP_DOTS = { date: "#F59E0B", branch: "#3B82F6" } as const;

export const VALUE_TONE: Record<string, string> = {
  default: "text-black",
  blue: "text-blue-600",
  green: "text-green-600",
  emerald: "text-emerald-600",
  rose: "text-rose-500",
  gray: "text-gray-500",
  amber: "text-amber-600",
};
