import { ClientEntity, FirmStudioState } from '../../models/client';

export type StudioLens = 'all' | 'onboarded' | 'none' | 'nopower' | 'unclassified';

export interface StudioRow {
  client: ClientEntity;
  studio: FirmStudioState;
}

export interface KamOnboarding {
  kam: string;
  firms: number;
  onboarded: number;
  pct: number | null;
}
