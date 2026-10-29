'use client';

export type View = 'list' | 'board';

export type Section = 'clients' | 'pi' | 'results';

export type Lens =
  | 'today' | 'new' | 'overdue' | 'due'
  | 'clients' | 'upcoming' | 'undated' | 'arrived'
  | 'pis' | 'pi' | 'piChase' | 'piWon' | 'piDropped'
  | 'results' | 'closed' | 'lost' | 'invalid' | 'sent'
  | 'all' | 'gaps';

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

export type PiBasis = 'shared' | 'called';

export interface PiRange {
  basis: PiBasis;
  days: number | null;
  from: string;
  to: string;
}
