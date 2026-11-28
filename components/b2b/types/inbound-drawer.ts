'use client';

export interface SaveState {
  saving: boolean;

  warning?: string;
  error?: string;
}

export type DrawerTab = 'activity' | 'client' | 'deal' | 'handoff' | 'source';
