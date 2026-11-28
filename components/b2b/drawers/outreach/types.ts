'use client';

export interface SaveState {
  saving: boolean;
  warning?: string;
  error?: string;
}

export type OutreachTab = 'activity' | 'meetings' | 'client' | 'deal' | 'handoff' | 'journey';

export interface OutreachTabDef { key: OutreachTab; label: string; badge?: string; warn?: boolean }
