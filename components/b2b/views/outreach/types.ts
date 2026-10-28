import { OutreachLead } from '../../models/mock-data';
import { Rep } from '../../models/outreach/intake';

export interface OutreachScope {
  mode: 'team' | 'mine' | 'open';
  me: Rep;
  isManager: boolean;
  isKam: boolean;
  reps: Rep[];
  kams: Rep[];
  notice: string | null;
  owns: (l: OutreachLead) => boolean;
}

export type SaveLead = (before: OutreachLead | null, after: OutreachLead) => Promise<string | null>;
