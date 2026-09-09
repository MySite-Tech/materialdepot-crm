import { typeLabel } from '../../data/auditRegistry';
import { CoeInstall, CoeSubjob, FollowupRow, InstallReviewBucketKey, InstallReviewRow, ReviewProgress } from '../../types/coe';
import { addDays, emptyProgress, todayStr } from '../../utils/coe';
export function auditReviewProgress(rows: FollowupRow[]): ReviewProgress {
  const p = emptyProgress();
  for (const r of rows) {
    const d1 = r.cps.find((c) => c.k === 'd1');
    if (!d1 || !d1.applies) continue;

    if (!(d1.state === 'done' || d1.state === 'overdue' || d1.state === 'due')) continue;
    p.due++;
    if (d1.calls.length) p.called++;
    if (d1.calls.some((c) => c.ratings && c.ratings.q1)) p.scored++;
  }
  return p;
}

export function installReviewProgress(rows: InstallReviewRow[]): ReviewProgress {
  const p = emptyProgress();
  for (const r of rows) {
    if (r.bucket === 'upcoming') continue;
    p.due++;
    const calls = r.sj.coe_review?.calls || [];
    if (calls.length) p.called++;
    if (calls.some((c) => c.ratings && c.ratings.q1)) p.scored++;
  }
  return p;
}

function installCompletionDate(order: CoeInstall, sj: CoeSubjob): string | null {
  const prefix = typeLabel(sj.type) + ' installation completed';
  let latest: string | null = null;
  for (const l of order.log || []) {
    if (typeof l?.t === 'string' && l.t.startsWith(prefix) && l.d) {
      const d = String(l.d).slice(0, 10);
      if (!latest || d > latest) latest = d;
    }
  }
  return latest;
}

export function installPrimaryInstaller(sj: CoeSubjob): { email: string | null; name: string | null } {
  const a = sj.assignments?.find((x) => x.primary) || sj.assignments?.[0];
  return { email: a?.installer_email || sj.installer_email || null, name: a?.installer_name || sj.installer || null };
}

export function installReviewRows(orders: CoeInstall[]): InstallReviewRow[] {
  const today = todayStr();
  const rows: InstallReviewRow[] = [];
  orders.forEach((order) => {
    (order.subjobs || []).forEach((sj) => {
      if (sj.status !== 'completed') return;
      const completedOn = installCompletionDate(order, sj);
      if (!completedOn) return;
      const dueOn = addDays(completedOn, 1);
      const done = !!(sj.coe_review?.calls && sj.coe_review.calls.length);
      const bucket: InstallReviewBucketKey = done ? 'done' : dueOn < today ? 'overdue' : dueOn === today ? 'today' : 'upcoming';
      rows.push({ order, sj, completedOn, dueOn, installer: installPrimaryInstaller(sj), bucket });
    });
  });
  return rows;
}
