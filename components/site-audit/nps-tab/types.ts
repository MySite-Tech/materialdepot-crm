export type NpsKind = 'audit' | 'install';

export type NpsBand = 'promoter' | 'neutral' | 'detractor';

export type NpsBandFilter = 'all' | NpsBand | 'unscored';

export type NpsTarget = {
  orderId: string; sjId: string | null; label: string;
  staffEmail: string | null; staffName: string | null; q1: number | null;
};

export type NpsJob = {
  enq: string; name: string; phone: string; city: string | null; date: string | null;
  staff: string | null; q1: number | null; q3: number | null; target: NpsTarget;
};

export type NpsRow = {
  enq: string; name: string; phone: string; city: string | null; date: string | null;
  staff: string[]; overall: number | null; clean: number | null;
  jobs: number; scoredJobs: number; band: NpsBand | null; targets: NpsTarget[];
};

export type NpsSummary = {
  nps: number | null; prom: number; neu: number; det: number;
  scored: number; unscored: number; avgClean: number | null;
};

export type NpsScores = { q1: number; q2: number; q3: number };
