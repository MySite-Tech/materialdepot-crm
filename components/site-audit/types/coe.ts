export type CoeCall = { id: string; ts: string; stage: string; who: string; outcome: string; note: string; ratings?: { q1: number; q2: number; q3: number }; by?: { email?: string; name?: string } };

export type CoeOrderPlaced = { kind?: string; ref?: string; at: string; by?: { email?: string; name?: string }; auto?: boolean; orderId?: string };

export type CoeTrack = {
  calls?: CoeCall[];
  order_placed?: CoeOrderPlaced | null;
  result?: 'converted' | 'lost' | null;
  lost_reason?: string;
  snooze_until?: string | null;
};

export type CoeOrder = {
  id: string; pi: string; po: string[]; skus: any[]; bm: string; bmEmail: string | null;
  name: string; phone: string; addr: string; status: string; service: any; slot: string | null;
  date: string | null; auditorName: string | null; auditorEmail: string | null; createdAt: string | null;
  city: string | null; coeTrack: CoeTrack;

  tickedCats: string[];
};

export type CoeInstall = {
  id: string; pi: string; po: string[]; phone: string; name: string; addr: string; bm: string;
  createdAt: string | null; status: string; customWp: boolean; deliveryDate: string | null;
  subjobs: CoeSubjob[]; log: any[];
};

export type CoeSubjobAssignment = { installer_email?: string; installer_name?: string; primary?: boolean };

export type CoeSubjob = {
  id: string; type: string; status: string; assignments?: CoeSubjobAssignment[];
  installer_email?: string | null; installer?: string | null;
  coe_review?: { calls?: CoeCall[] };
};

export type Checkpoint = { k: 'd1' | 'd3' | 'd14'; days: number; label: string; who: 'client' | 'bm' | 'both'; always: boolean; hint: string };

export type BucketKey = 'overdue' | 'today' | 'upcoming' | 'snoozed' | 'open' | 'converted' | 'lost';

export type CheckpointState = Checkpoint & {
  applies: boolean; dueOn: string | null; state: 'n/a' | 'done' | 'pending' | 'overdue' | 'due';
  calls: CoeCall[]; last: CoeCall | null;
};

export type DateRange = { from: string; to: string };

export type DatePresetKey = 'all' | 'today' | 'last7' | 'last30' | 'last90' | 'thismonth' | 'lastmonth' | 'custom';

export type FollowupRow = { o: CoeOrder; placed: CoeOrderPlaced | null; cps: CheckpointState[]; bucket: BucketKey; nextDue: CheckpointState | null };

export type JobRatingInput = {
  orderType: 'audit' | 'install';
  pi: string; orderId: string;
  staffEmail: string | null; staffName: string | null;
  q1: number; q2: number; q3: number; comments: string;
  customerName: string; customerPhone: string;
};

export type RatingRow = {
  order_type: string; order_id: string | null; pi: string | null;
  q1_score: number | null; q2_score: number | null; q3_score: number | null;
  created_at: string; staff_email: string | null;
};

export type ScoredCall = {
  key: string; orderType: 'audit' | 'install'; at: string;
  q1: number; q2: number; q3: number;
  customer: string; staffName: string | null; label: string;
  input: JobRatingInput;
};

export type ReviewProgress = { due: number; called: number; scored: number };

export type InstallReviewBucketKey = 'overdue' | 'today' | 'upcoming' | 'done';

export type InstallReviewRow = {
  order: CoeInstall; sj: CoeSubjob; completedOn: string; dueOn: string;
  installer: { email: string | null; name: string | null }; bucket: InstallReviewBucketKey;
};

export type NewWpRow = {
  pi: string; md_id: string; vendor: string; customer_name: string; phone: string; bm: string;
  notes: string; order_placed_at: string; install_order_id: string | null; city: string | null;
};
