import { ALL_STORE_ROLES, BACKDATE_DAYS, BRANCH_NAME_TO_STORE_CODE, CHECKLIST_SECTIONS, DEFAULT_BACKDATE_DAYS } from './constants';
import type { ChecklistDay, ChecklistIssue, ChecklistMarks, ChecklistSectionKey, DayProgress, SectionProgress } from './types';
import { STORES, STORE_NAMES } from '../store-display/display-supabase';

export const CHECKLIST_ITEM_INDEX: Record<string, { label: string; sectionKey: ChecklistSectionKey }> =
  Object.fromEntries(
    CHECKLIST_SECTIONS.flatMap((s) => s.items.map((i) => [i.id, { label: i.label, sectionKey: s.key }])),
  );

export const CHECKLIST_ITEM_TOTAL = Object.keys(CHECKLIST_ITEM_INDEX).length;

export function istToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function recentDates(days: number, endDate = istToday()): string[] {
  return Array.from({ length: days }, (_, i) => shiftDate(endDate, -i));
}

export function isValidDate(date: unknown): date is string {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export function isKnownStoreCode(code: unknown): code is string {
  return typeof code === 'string' && STORES.some((s) => s.code === code);
}

export function storeLabel(code: string): string {
  return STORE_NAMES[code] ?? code;
}

const normaliseBranch = (name: string): string => name.toLowerCase().replace(/[^a-z]/g, '');

export function storeCodeForBranch(name: string): string | null {
  return BRANCH_NAME_TO_STORE_CODE[normaliseBranch(name)] ?? null;
}

export function storesForUser(
  role: string | undefined,
  allowedBranches: readonly string[] | undefined,
): { codes: string[]; unmatched: string[] } {
  const all = STORES.map((s) => s.code);
  if (ALL_STORE_ROLES.has(role ?? '')) return { codes: all, unmatched: [] };
  const named = (allowedBranches ?? []).filter((b) => b && b.trim());
  if (!named.length) return { codes: all, unmatched: [] };

  const codes: string[] = [];
  const unmatched: string[] = [];
  for (const branch of named) {
    const code = storeCodeForBranch(branch);
    if (!code) { unmatched.push(branch); continue; }
    if (!codes.includes(code)) codes.push(code);
  }
  return { codes, unmatched };
}

export function backdateDaysFor(role: string | undefined): number {
  return BACKDATE_DAYS[role ?? ''] ?? DEFAULT_BACKDATE_DAYS;
}

export function canMarkDate(role: string | undefined, date: string, today = istToday()): boolean {
  if (!isValidDate(date) || date > today) return false;
  return date >= shiftDate(today, -backdateDaysFor(role));
}

export function dayProgress(marks: ChecklistMarks | null | undefined): DayProgress {
  const items = marks ?? {};
  const sections: SectionProgress[] = CHECKLIST_SECTIONS.map((section) => {
    const counts = { yes: 0, no: 0, na: 0 };
    for (const item of section.items) {
      const v = items[item.id]?.v;
      if (v === 'yes' || v === 'no' || v === 'na') counts[v] += 1;
    }
    const answered = counts.yes + counts.no + counts.na;
    return {
      key: section.key,
      answered,
      total: section.items.length,
      ...counts,
      complete: answered === section.items.length,
    };
  });

  const sum = (pick: (s: SectionProgress) => number) => sections.reduce((n, s) => n + pick(s), 0);
  const answered = sum((s) => s.answered);

  let noWithoutNote = 0;
  for (const [id, mark] of Object.entries(items)) {
    if (mark?.v === 'no' && !mark.c?.trim() && CHECKLIST_ITEM_INDEX[id]) noWithoutNote += 1;
  }

  return {
    answered,
    total: CHECKLIST_ITEM_TOTAL,
    yes: sum((s) => s.yes),
    no: sum((s) => s.no),
    na: sum((s) => s.na),
    noWithoutNote,
    complete: answered === CHECKLIST_ITEM_TOTAL,
    sections,
  };
}

export function issuesFor(day: ChecklistDay): ChecklistIssue[] {
  const out: ChecklistIssue[] = [];
  for (const [itemId, mark] of Object.entries(day.items ?? {})) {
    if (mark?.v !== 'no') continue;
    const known = CHECKLIST_ITEM_INDEX[itemId];
    if (!known) continue;
    out.push({
      storeCode: day.storeCode,
      date: day.date,
      sectionKey: known.sectionKey,
      itemId,
      label: known.label,
      comment: mark.c?.trim() ?? '',
      at: mark.at ?? '',
      by: mark.by ?? '',
    });
  }
  return out.sort((a, b) => (a.date === b.date ? a.itemId.localeCompare(b.itemId) : b.date.localeCompare(a.date)));
}

export function emptyDay(storeCode: string, date: string): ChecklistDay {
  return { storeCode, date, items: {}, updatedAt: null, updatedBy: null };
}
