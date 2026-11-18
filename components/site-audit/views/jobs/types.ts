export type JobCategory = { id: string; label: string; installer: string | null };

export type Job = {
  id: string;
  type: 'audit' | 'install';
  customer: string;
  leadKey: string;
  assignee: string | null;
  status: string;
  date: string | null;
  slot: string;
  booked: boolean;
  installDates?: string[];
  city?: string | null;
  cats: JobCategory[];
};

export type EcState = { status: 'loading' | 'ok' | 'error'; byLead: Record<string, string> };
