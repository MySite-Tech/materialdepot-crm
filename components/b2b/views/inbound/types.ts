'use client';

export type View = 'list' | 'board';

export type Lens =
  | 'today' | 'new' | 'due' | 'overdue' | 'ready'
  | 'open' | 'nurture' | 'followup' | 'pi'
  | 'results' | 'sent' | 'closed' | 'lost' | 'invalid'
  | 'arrived' | 'upcoming' | 'undated' | 'all' | 'gaps';

export interface LensMeta {
  title: string;
  rule: string;
  empty: string;
  accent: string;
}

export interface InboundFilters {
  owner: string;
  status: string;
  priority: string;
  clientType: string;
  leadType: string;
  location: string;
  kylasStage: string;
  createdFrom: string;
  createdTo: string;
}
