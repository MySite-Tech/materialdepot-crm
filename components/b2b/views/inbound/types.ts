'use client';

export type View = 'list' | 'board';

export type Lens =
  | 'today' | 'new' | 'overdue' | 'due'
  | 'upcoming' | 'pi' | 'open'
  | 'closed' | 'lost'
  | 'all' | 'arrived' | 'undated' | 'gaps';

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
