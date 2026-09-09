import { sbGet, sbPatch, sbPost } from '../../shared';
import { WP_ROUND_KEYS, WpNext, WpRow, wpRounds, wpStageLabel } from '../wallpaper/track';
import { CoeSubjob, CoeTrack, JobRatingInput, NewWpRow } from '../types';

export async function patchCoe(orderId: string, mutate: (t: CoeTrack) => CoeTrack, logText: string | null, who: string): Promise<CoeTrack> {
  const rows = await sbGet('audit_orders?id=eq.' + orderId + '&select=coe_track,log');
  if (!Array.isArray(rows) || !rows[0]) throw new Error('could not re-read this order');
  const cur: CoeTrack = (rows[0].coe_track && typeof rows[0].coe_track === 'object') ? rows[0].coe_track : {};
  const next = mutate(JSON.parse(JSON.stringify(cur)));
  const body: any = { coe_track: next };
  if (logText) {
    const log = Array.isArray(rows[0].log) ? rows[0].log : [];
    log.push({ t: logText, d: new Date().toISOString(), by: 'manual', who });
    body.log = log;
  }
  await sbPatch('audit_orders', orderId, body);
  return next;
}

export async function postJobRating(input: JobRatingInput): Promise<void> {
  const body = {
    order_type: input.orderType, pi: input.pi, order_id: input.orderId,
    staff_email: input.staffEmail, staff_name: input.staffName,
    q1_score: input.q1, q2_score: input.q2, q3_score: input.q3,
    comments: input.comments || '', customer_name: input.customerName, customer_phone: input.customerPhone,
  };
  try {
    await sbPost('ratings', body);
  } catch {
    const { q3_score, ...withoutQ3 } = body;
    await sbPost('ratings', withoutQ3);
  }
}

export async function patchInstallReview(
  orderId: string, sjId: string, mutate: (sj: CoeSubjob) => CoeSubjob, logText: string, who: string,
): Promise<void> {
  const rows = await sbGet('install_orders?id=eq.' + orderId + '&select=subjobs,log');
  if (!Array.isArray(rows) || !rows[0]) throw new Error('could not re-read this order');
  const subjobs: CoeSubjob[] = Array.isArray(rows[0].subjobs) ? rows[0].subjobs : [];
  const idx = subjobs.findIndex((s) => s.id === sjId);
  if (idx === -1) throw new Error('sub-job not found');
  subjobs[idx] = mutate(JSON.parse(JSON.stringify(subjobs[idx])));
  const log = Array.isArray(rows[0].log) ? rows[0].log : [];
  log.push({ t: logText, d: new Date().toISOString(), by: 'manual', who });
  await sbPatch('install_orders', orderId, { subjobs, log });
}

export async function patchWp(row: WpRow, mutate: (cur: WpRow) => WpRow, logText: string, who: string): Promise<WpRow> {
  const rows = await sbGet('wp_production?id=eq.' + row.id + '&select=*');
  if (!Array.isArray(rows) || !rows[0]) throw new Error('could not re-read this order');
  const cur: WpRow = JSON.parse(JSON.stringify(rows[0]));
  const next = mutate(cur);
  const log = Array.isArray(next.log) ? next.log : [];
  if (logText) log.push({ t: logText, d: new Date().toISOString(), by: 'manual', who });
  const body: any = {
    stages: next.stages || {}, rounds: next.rounds || [], state: next.state || 'active', notes: next.notes || '', log,
    customer_name: next.customer_name || null, phone: next.phone || null, bm: next.bm || null,
  };
  await sbPatch('wp_production', row.id, body);
  return { ...row, ...body };
}

export async function stampWpStage(row: WpRow, next: WpNext, opts: { note: string; decision?: string | null }, who: string): Promise<WpRow> {
  const stamp = { at: new Date().toISOString(), by: { name: who }, note: opts.note || '' };
  const label = wpStageLabel(next.k, row.vendor);
  const logText = label + (opts.note ? ' — ' + opts.note : '') + (opts.decision ? ' [' + opts.decision + ']' : '')
    + (next.redo ? ' (round ' + (wpRounds(row).length + 1) + ')' : '');
  return patchWp(row, (cur) => {
    cur.stages = (cur.stages && typeof cur.stages === 'object') ? cur.stages : {};
    cur.rounds = Array.isArray(cur.rounds) && cur.rounds.length ? cur.rounds : [{ n: 1 }];
    if (WP_ROUND_KEYS.includes(next.k)) {
      if (next.redo) cur.rounds.push({ n: cur.rounds.length + 1 });
      const round: any = cur.rounds[cur.rounds.length - 1];
      if (next.k === 'client_approval') {
        round.approval = { ...stamp, decision: (opts.decision || 'approved') as any };
        if (opts.decision === 'cancelled') cur.state = 'cancelled';
      } else {
        round[next.k] = stamp;
      }
    } else {
      (cur.stages as any)[next.k] = stamp;
    }
    return cur;
  }, logText, who);
}

export async function createWpRow(input: NewWpRow, who: string): Promise<any> {
  const body: any = {
    pi: input.pi, md_id: input.md_id, vendor: input.vendor,
    customer_name: input.customer_name, phone: input.phone, bm: input.bm, notes: input.notes,
    order_placed_at: input.order_placed_at, stages: {}, rounds: [{ n: 1 }], state: 'active',
    install_order_id: input.install_order_id,
    log: [{ t: 'Production tracking started', d: new Date().toISOString(), by: 'manual', who }],
  };
  if (input.city) body.city = input.city;
  const made = await sbPost('wp_production', body);
  return Array.isArray(made) ? made[0] : made;
}
