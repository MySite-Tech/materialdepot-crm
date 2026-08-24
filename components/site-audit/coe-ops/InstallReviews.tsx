'use client';

/* D+1 installation review calls (note 117 in the sibling material-depot-site repo) — one
   checkpoint per COMPLETED SUB-JOB, not per order, since a mixed order's flooring and wallpaper
   sub-jobs complete (and so review) independently. Structural mirror of Followups.tsx's audit
   call-queue UI; every historical "Overdue" on day one is expected, not a bug — the same thing
   happened when the audit follow-up queue first shipped. */

import { useState } from 'react';
import { fmtDateA, fmtLog } from '../siteAuditShared';
import { categoryFor } from '../auditRegistry';
import {
  INSTALL_REVIEW_BUCKETS, OUTCOMES, daysBetween, installReviewRows, mapUrl, patchInstallReview, postJobRating, todayStr,
  type CoeInstall, type CoeSubjob, type InstallReviewBucketKey, type InstallReviewRow as Row,
} from './shared';

function firstNonEmpty(order: string[], counts: Record<string, number>, fallback: string): string {
  for (const k of order) if (counts[k]) return k;
  return fallback;
}

export default function InstallReviews({ installs, who, onChanged }: { installs: CoeInstall[]; who: string; onChanged: () => void }) {
  const [bucket, setBucket] = useState<InstallReviewBucketKey>('overdue');
  const [bucketPicked, setBucketPicked] = useState(false);
  const [q, setQ] = useState('');
  // Keyed by "order id · sub-job id" — a sub-job id alone isn't guaranteed unique across orders.
  const [openKey, setOpenKey] = useState<string | null>(null);

  const all = installReviewRows(installs);
  const counts: Record<string, number> = {};
  INSTALL_REVIEW_BUCKETS.forEach((b) => { counts[b.k] = 0; });
  all.forEach((r) => { counts[r.bucket] = (counts[r.bucket] || 0) + 1; });

  let activeBucket = bucket;
  if (!bucketPicked && !counts[bucket]) activeBucket = firstNonEmpty(INSTALL_REVIEW_BUCKETS.map((b) => b.k), counts, bucket) as InstallReviewBucketKey;

  const list = all.filter((r) => r.bucket === activeBucket)
    .filter((r) => !q || [r.order.pi, r.order.name, r.order.phone, r.order.bm, r.installer.name].join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));

  const openRow = openKey ? all.find((r) => r.order.id + '·' + r.sj.id === openKey) || null : null;

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-lg font-bold text-black">Installation → D+1 client review</h1>
        <p className="text-[13px] text-gray-400">Every completed installation sub-job and whether its D+1 review call has been made. One row per category, not per order.</p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {INSTALL_REVIEW_BUCKETS.map((b) => (
          <button
            key={b.k}
            onClick={() => { setBucket(b.k); setBucketPicked(true); }}
            className={`rounded-lg border px-3 py-2.5 text-left ${activeBucket === b.k ? 'border-[#1F3A5F] bg-[#eef3f9]' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
          >
            <div className={`text-[20px] font-extrabold leading-tight ${b.k === 'overdue' ? 'text-red-600' : b.k === 'today' ? 'text-amber-600' : b.k === 'done' ? 'text-green-700' : 'text-[#1F3A5F]'}`}>{counts[b.k] || 0}</div>
            <div className="mt-0.5 text-[11px] font-semibold text-gray-500">{b.l}</div>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-[320px] flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">🔎</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client, phone, ENQ, BM, installer…" className="w-full rounded-md border border-gray-200 py-2 pl-8 pr-3 text-[13.5px] outline-none focus:border-yellow-400" />
        </div>
        <div className="text-[12px] text-gray-400">{all.length} completed sub-job{all.length === 1 ? '' : 's'} tracked</div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        {list.length ? (
          <table className="w-full">
            <thead>
              <tr>{['Client', 'Order', 'Category', 'BM', 'Installer', 'Next call'].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {list.map((r) => <ReviewRow key={r.order.id + '·' + r.sj.id} row={r} onOpen={() => setOpenKey(r.order.id + '·' + r.sj.id)} />)}
            </tbody>
          </table>
        ) : (
          <div className="py-12 text-center text-[13px] text-gray-400">
            <div className="mb-2 text-2xl">{counts[activeBucket] ? '🔎' : '✅'}</div>
            {counts[activeBucket] ? 'No rows match your search.' : 'Nothing in this bucket.'}
          </div>
        )}
      </div>

      {openRow ? (
        <ReviewDrawer row={openRow} who={who} onClose={() => { setOpenKey(null); onChanged(); }} />
      ) : null}
    </div>
  );
}

function ReviewRow({ row: r, onOpen }: { row: Row; onOpen: () => void }) {
  const st = r.bucket;
  const cls = st === 'overdue' ? 'bg-red-100 text-red-700' : st === 'today' ? 'bg-amber-100 text-amber-700' : st === 'done' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700';
  const when = st === 'done' ? 'Reviewed' : st === 'overdue' ? daysBetween(r.dueOn, todayStr()) + 'd overdue' : st === 'today' ? 'today' : fmtDateA(r.dueOn);
  return (
    <tr onClick={onOpen} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-2.5 text-[13px]"><div className="font-bold text-gray-900">{r.order.name || '—'}</div><div className="text-[11.5px] text-gray-400">{r.order.phone || '—'}</div></td>
      <td className="px-3 py-2.5 text-[13px]"><div>{fmtDateA(r.completedOn)}</div><div className="text-[11.5px] text-gray-400">{r.order.pi}</div></td>
      <td className="px-3 py-2.5 text-[13px] text-gray-700">{categoryFor(r.sj.type).pdfLabel}</td>
      <td className="px-3 py-2.5 text-[13px] text-gray-700">{r.order.bm || '—'}</td>
      <td className="px-3 py-2.5 text-[13px] text-gray-700">{r.installer.name || '—'}</td>
      <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{when}</span></td>
    </tr>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 border-b border-gray-100 pb-4 last:border-b-0">
      <h3 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-wider text-gray-500">{title}</h3>
      {children}
    </div>
  );
}
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex gap-3 py-0.5 text-[13px]"><span className="w-24 shrink-0 text-gray-400">{k}</span><span className="min-w-0 text-gray-900">{v}</span></div>;
}
function ScoreSelect({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="mb-1.5">
      <label className="mb-0.5 block text-[12px] font-semibold text-gray-700">{label}</label>
      <select value={value || ''} onChange={(e) => onChange(Number(e.target.value))} className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]">
        <option value="">Select…</option>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}

function ReviewDrawer({ row, who, onClose }: { row: Row; who: string; onClose: () => void }) {
  const [, force] = useState(0);
  const [msg, setMsg] = useState('');
  const [sj, setSj] = useState<CoeSubjob>(row.sj);
  const calls = (sj.coe_review?.calls || []).slice().sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  const cat = categoryFor(sj.type);

  async function run(mutate: (s: CoeSubjob) => CoeSubjob, logText: string, onOk?: string) {
    try {
      await patchInstallReview(String(row.order.id), sj.id, mutate, logText, who);
      setSj((cur) => mutate(JSON.parse(JSON.stringify(cur))));
      if (onOk) setMsg(onOk);
      force((n) => n + 1);
    } catch (e: any) {
      setMsg('Failed — ' + (e?.message || 'try again'));
    }
  }

  return (
    <div className="fixed inset-0 z-[900] flex justify-end bg-black/30" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl">
        <div className="flex items-start gap-2 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">{row.order.name || '—'}</h2>
            <div className="mt-0.5 text-[12.5px] text-gray-400">{row.order.pi} · {cat.pdfLabel} · completed {fmtDateA(row.completedOn)}</div>
          </div>
          <button className="ml-auto h-7 w-7 shrink-0 rounded-md bg-gray-100 text-gray-500" onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <Sec title="Who to call">
            <KV k="Client" v={<a className="text-blue-600" href={'tel:' + row.order.phone}>{row.order.phone || '—'}</a>} />
            <KV k="BM" v={row.order.bm || '—'} />
            <KV k="Installer" v={row.installer.name || '—'} />
            <KV k="Category" v={cat.pdfLabel} />
            <KV k="Address" v={row.order.addr ? <a className="text-blue-600" href={mapUrl(row.order.addr)} target="_blank" rel="noopener noreferrer">📍 {row.order.addr}</a> : '—'} />
          </Sec>

          <Sec title="D+1 review">
            {calls.length ? (
              <div className="rounded-lg bg-green-50 px-3 py-2 text-[12.5px] text-green-700">✓ Reviewed — {fmtLog(calls[0].ts)}</div>
            ) : (
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-[12.5px] text-gray-600">Not yet called. Due {fmtDateA(row.dueOn)}.</div>
            )}
          </Sec>

          <Sec title="Log a call">
            <LogInstallCallForm order={row.order} sj={sj} run={run} />
          </Sec>

          <Sec title="Call history">
            {calls.length ? calls.map((c) => (
              <div key={c.id} className="border-b border-gray-100 py-2 last:border-b-0">
                <div className="text-[13px] font-bold">D+1 · Client installation review</div>
                {c.note ? <div className="mt-0.5 text-[12.5px]">{c.note}</div> : null}
                {c.ratings ? <div className="mt-0.5 text-[12.5px] font-semibold text-[#1F3A5F]">⭐ {c.ratings.q1}/10 · 👤 {c.ratings.q2}/10 · 🧹 {c.ratings.q3}/10</div> : null}
                <div className="mt-0.5 text-[11.5px] text-gray-400">{OUTCOMES.find((x) => x.k === c.outcome)?.l || c.outcome} · {fmtLog(c.ts)}{c.by?.name ? ' · ' + c.by.name : ''}</div>
              </div>
            )) : <div className="text-[12.5px] text-gray-400">No calls logged yet.</div>}
          </Sec>
        </div>

        {msg ? <div className="border-t border-gray-100 bg-blue-50 px-5 py-2 text-[12.5px] font-semibold text-blue-700">{msg}</div> : null}
      </div>
    </div>
  );
}

function LogInstallCallForm({ order, sj, run }: { order: CoeInstall; sj: CoeSubjob; run: (mutate: (s: CoeSubjob) => CoeSubjob, logText: string, onOk?: string) => Promise<void> }) {
  const [outcome, setOutcome] = useState(OUTCOMES[0].k);
  const [note, setNote] = useState('');
  const [q1, setQ1] = useState(0);
  const [q2, setQ2] = useState(0);
  const [q3, setQ3] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Install has exactly one checkpoint, so — unlike the audit side — no stage/who gating is
  // needed beyond "did we actually reach the client."
  const needsRatings = outcome === 'reached';

  async function save() {
    setErr('');
    if (!note.trim()) { setErr("Add a short note on what they said — that's the point of the call log."); return; }
    if (needsRatings && (!q1 || !q2 || !q3)) { setErr('All three ratings are required when the client was reached for the D+1 review.'); return; }
    setBusy(true);
    const ratings = needsRatings ? { q1, q2, q3 } : undefined;
    const catLabel = categoryFor(sj.type).pdfLabel;
    await run((s) => {
      s.coe_review = s.coe_review || {};
      (s.coe_review.calls = s.coe_review.calls || []).push({
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        ts: new Date().toISOString(), stage: 'd1', who: 'client', outcome, note: note.trim(),
        ...(ratings ? { ratings } : {}),
      });
      return s;
    }, 'D+1 · Client installation review — ' + catLabel + ': ' + note.trim(), 'Call logged');
    if (ratings) {
      const installer = sj.assignments?.find((a) => a.primary) || sj.assignments?.[0];
      try {
        await postJobRating({
          orderType: 'install', pi: order.pi, orderId: String(order.id),
          staffEmail: installer?.installer_email || sj.installer_email || null,
          staffName: installer?.installer_name || sj.installer || null,
          q1: ratings.q1, q2: ratings.q2, q3: ratings.q3, comments: note.trim(),
          customerName: order.name, customerPhone: order.phone,
        });
      } catch (e) {
        console.error('ratings write failed', e);
      }
    }
    setNote(''); setQ1(0); setQ2(0); setQ3(0);
    setBusy(false);
  }

  return (
    <div>
      <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]">
        {OUTCOMES.map((x) => <option key={x.k} value={x.k}>{x.l}</option>)}
      </select>
      {needsRatings ? (
        <div className="mb-1.5 rounded-md bg-gray-50 p-2">
          <ScoreSelect label="Overall site installation experience" value={q1} onChange={setQ1} />
          <ScoreSelect label="Site installer rating" value={q2} onChange={setQ2} />
          <ScoreSelect label="How clean did the installer leave the site after the installation?" value={q3} onChange={setQ3} />
        </div>
      ) : null}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Their review / reason / next step…" className="mb-1.5 min-h-[56px] w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
      {err ? <div className="mb-1 text-[11.5px] text-red-600">{err}</div> : null}
      <button disabled={busy} onClick={save} className="rounded-md bg-[#1F3A5F] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save call'}</button>
    </div>
  );
}
