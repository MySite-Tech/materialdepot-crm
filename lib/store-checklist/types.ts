export type ChecklistValue = 'yes' | 'no' | 'na';

export type ChecklistSectionKey = 'opening' | 'hk' | 'working' | 'closing';

export interface ChecklistItem {
  id: string;
  label: string;
}

export interface ChecklistSection {
  key: ChecklistSectionKey;
  label: string;
  when: string;
  items: ChecklistItem[];
}

export interface ChecklistMark {
  v: ChecklistValue;
  c?: string;
  at?: string;
  by?: string;
}

export type ChecklistMarks = Record<string, ChecklistMark>;

export interface ChecklistDay {
  storeCode: string;
  date: string;
  items: ChecklistMarks;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface SectionProgress {
  key: ChecklistSectionKey;
  answered: number;
  total: number;
  yes: number;
  no: number;
  na: number;
  complete: boolean;
}

export interface DayProgress {
  answered: number;
  total: number;
  yes: number;
  no: number;
  na: number;
  noWithoutNote: number;
  complete: boolean;
  sections: SectionProgress[];
}

export interface ChecklistIssue {
  storeCode: string;
  date: string;
  sectionKey: ChecklistSectionKey;
  itemId: string;
  label: string;
  comment: string;
  at: string;
  by: string;
}
