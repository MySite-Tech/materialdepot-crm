'use client';

import { ChangeStatus, RemovalStatus } from './types';

export const DISPLAY_TYPES = ['shelves', 'drawer', 'catalogue', 'panel_display', 'flaps', 'slots', 'wall_display', 'floor_stand'];

export const CHANGE_STEPS: { key: ChangeStatus; label: string }[] = [
  { key: 'change_initiated', label: 'Initiated' },
  { key: 'request_completed', label: 'Completed' },
];

export const REMOVAL_STEPS: { key: RemovalStatus; label: string }[] = [
  { key: 'removal_initiated', label: 'Initiated' },
  { key: 'removal_completed', label: 'Completed' },
];
