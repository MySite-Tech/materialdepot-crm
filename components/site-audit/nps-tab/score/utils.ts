import { patchCoe, patchInstallReview, postJobRating } from '../../coe-ops';
import type { CoeCall } from '../../coe-ops/types';
import type { NpsKind, NpsRow, NpsScores, NpsTarget } from '../types';

export type ScoreResult = { ok: true; warn: string | null } | { ok: false; error: string };

export async function saveScore(
  kind: NpsKind, row: NpsRow, target: NpsTarget, scores: NpsScores, note: string,
  who: string, whoEmail: string | null | undefined,
): Promise<ScoreResult> {
  const text = note.trim() || 'Score added from the NPS tab';
  const call: CoeCall = {
    id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    ts: new Date().toISOString(), stage: 'd1', who: 'client', outcome: 'reached', note: text,
    ratings: scores, by: { email: whoEmail || undefined, name: who },
  };
  try {
    if (kind === 'audit') {
      await patchCoe(target.orderId, (t) => { (t.calls = t.calls || []).push(call); return t; },
        'D+1 client review (NPS tab) — client: ' + text, who);
    } else {
      await patchInstallReview(target.orderId, String(target.sjId), (s) => {
        s.coe_review = s.coe_review || {};
        (s.coe_review.calls = s.coe_review.calls || []).push(call);
        return s;
      }, 'D+1 · Client installation review (NPS tab) — ' + target.label + ': ' + text, who);
    }
  } catch (e: any) {
    return { ok: false, error: 'Score not saved: ' + (e?.message || 'unknown error') };
  }
  try {
    await postJobRating({
      orderType: kind, pi: row.enq, orderId: target.orderId,
      staffEmail: target.staffEmail, staffName: target.staffName,
      ...scores, comments: text, customerName: row.name, customerPhone: row.phone,
    });
  } catch (e: any) {
    return { ok: true, warn: 'Score saved. Copying it to the analytics table failed (' + (e?.message || 'unknown error') + '); push it from Category Ops → ⭐ Review scores.' };
  }
  return { ok: true, warn: null };
}
