'use client';

import { useMemo, useState } from 'react';
import { fmtDateA, fmtLog } from '../siteAuditShared';
import {
  BUCKETS, CHECKPOINTS, OUTCOMES, addDays, bucketFor, categoriesFor, checkpointState,
  coeCalls, daysBetween, followupRows, mapUrl, orderPlacedFor, patchCoe, todayStr,
  type BucketKey, type CheckpointState, type CoeInstall, type CoeOrder, type FollowupRow as Row,
} from './shared';

function exportCsv(rows: Row[]) {
  const head = ['ENQ ID', 'Client Name', 'Client Number', 'Categories', 'Auditor', 'BM', 'Audit Date', 'Order Placed', 'D+1 (Audit Review)', 'D+3 (BM review)', 'D+14 (BM + client)', 'Result'];
  const cell = (v: any) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const noteOf = (cp: CheckpointState | undefined) => (cp && cp.last) ? ((cp.last.note || '') + (cp.last.outcome ? ' [' + cp.last.outcome + ']' : '')) : '';
  const body = rows.map((r) => {
    const byK: Record<string, CheckpointState> = {};
    r.cps.forEach((c) => { byK[c.k] = c; });
    return [
      r.o.pi, r.o.name, r.o.phone, categoriesFor(r.o).map((c) => c.l).join(' + '), r.o.auditorName || '', r.o.bm || '', r.o.date || '',
      r.placed ? 'Y' : 'not yet', noteOf(byK.d1), noteOf(byK.d3), noteOf(byK.d14),
      r.o.coeTrack.result || (r.placed ? 'converted' : ''),
    ].map(cell).join(',');
  });
  const blob = new Blob([[head.map(cell).join(',')].concat(body).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'site-audit-followups-' + todayStr() + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* Both tabs open on the bucket that most needs attention. Until the person
   picks one themselves, an empty default falls through to the first bucket
   that actually has rows — otherwise you land on "Overdue" with nothing in
   it on a fresh install and think the tab is broken. */
function firstNonEmpty(order: string[], counts: Record<string, number>, fallback: string): string {
  for (const k of order) if (counts[k]) return k;
  return fallback;
}

export default function Followups({ orders, installByPhone, who, onChanged }: {
  orders: CoeOrder[]; installByPhone: Map<string, CoeInstall[]>; who: string; onChanged: () => void;
}) {
  const [bucket, setBucket] = useState<BucketKey>('overdue');
  const [bucketPicked, setBucketPicked] = useState(false);
  const [q, setQ] = useState('');
  const [openPi, setOpenPi] = useState<string | null>(null);

  const all = useMemo(() => followupRows(orders, installByPhone), [orders, installByPhone]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    BUCKETS.forEach((b) => { c[b.k] = 0; });
    all.forEach((r) => { c[r.bucket] = (c[r.bucket] || 0) + 1; });
    return c;
  }, [all]);

  let activeBucket = bucket;
  if (!bucketPicked && !counts[bucket]) activeBucket = firstNonEmpty(BUCKETS.map((b) => b.k), counts, bucket) as BucketKey;

  const list = all.filter((r) => r.bucket === activeBucket)
    .filter((r) => !q || [r.o.pi, r.o.name, r.o.phone, r.o.bm, r.o.auditorName].join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => String(a.nextDue?.dueOn || '9999').localeCompare(String(b.nextDue?.dueOn || '9999')));

  const openRow = openPi ? all.find((r) => r.o.pi === openPi) || null : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div>
          <h1 className="text-lg font-bold text-black">Site audit → order follow-ups</h1>
          <p className="text-[13px] text-gray-400">Every completed site audit and where its call cadence stands. D+1 client review → D+3 BM update if no cart → D+14 BM + client update if still no order.</p>
        </div>
        <button onClick={() => exportCsv(list)} className="ml-auto shrink-0 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700">⬇ CSV</button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {BUCKETS.map((b) => (
          <button
            key={b.k}
            onClick={() => { setBucket(b.k); setBucketPicked(true); }}
            className={`rounded-lg border px-3 py-2.5 text-left ${activeBucket === b.k ? 'border-[#1F3A5F] bg-[#eef3f9]' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
          >
            <div className={`text-[20px] font-extrabold leading-tight ${b.k === 'overdue' ? 'text-red-600' : b.k === 'today' ? 'text-amber-600' : b.k === 'converted' ? 'text-green-700' : 'text-[#1F3A5F]'}`}>{counts[b.k] || 0}</div>
            <div className="mt-0.5 text-[11px] font-semibold text-gray-500">{b.l}</div>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-[320px] flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">🔎</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client, phone, ENQ, BM, auditor…" className="w-full rounded-md border border-gray-200 py-2 pl-8 pr-3 text-[13.5px] outline-none focus:border-yellow-400" />
        </div>
        <div className="text-[12px] text-gray-400">{all.length} completed audit{all.length === 1 ? '' : 's'} tracked</div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        {list.length ? (
          <table className="w-full">
            <thead>
              <tr>{['Client', 'Audit', 'Categories', 'BM', 'Auditor', 'Order', 'Next call'].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {list.map((r) => <FollowupRow key={r.o.pi} row={r} onOpen={() => setOpenPi(r.o.pi)} />)}
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
        <FollowupDrawer
          order={openRow.o} installByPhone={installByPhone} who={who}
          onClose={() => { setOpenPi(null); onChanged(); }}
        />
      ) : null}
    </div>
  );
}

function FollowupRow({ row: r, onOpen }: { row: Row; onOpen: () => void }) {
  const o = r.o;
  const cats = categoriesFor(o);
  const placedTxt = r.placed
    ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">{r.placed.auto ? 'Order placed' : 'Marked placed'}</span>
    : (o.coeTrack.result === 'lost' ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-500">Lost</span> : <span className="text-[12px] text-gray-400">Not yet</span>);
  let nextTxt: React.ReactNode = <span className="text-gray-400">—</span>;
  if (r.nextDue) {
    const st = r.nextDue.state;
    const cls = st === 'overdue' ? 'bg-red-100 text-red-700' : st === 'due' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';
    const lbl = r.nextDue.k.toUpperCase().replace('D', 'D+');
    const when = st === 'overdue' ? daysBetween(r.nextDue.dueOn!, todayStr()) + 'd overdue' : st === 'due' ? 'today' : fmtDateA(r.nextDue.dueOn);
    nextTxt = <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{lbl} · {when}</span>;
  }
  return (
    <tr onClick={onOpen} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-2.5 text-[13px]"><div className="font-bold text-gray-900">{o.name || '—'}</div><div className="text-[11.5px] text-gray-400">{o.phone || '—'}</div></td>
      <td className="px-3 py-2.5 text-[13px]"><div>{o.date ? fmtDateA(o.date) : '—'}</div><div className="text-[11.5px] text-gray-400">{o.pi}</div></td>
      <td className="px-3 py-2.5">{cats.length ? cats.map((c) => <span key={c.l} className="mr-1 inline-block rounded px-1.5 py-0.5 text-[10.5px] font-bold" style={{ background: c.c === 'wp' ? '#efeaf8' : c.c === 'cwp' ? '#e0f4f4' : '#fff4d6', color: c.c === 'wp' ? '#5b3aa6' : c.c === 'cwp' ? '#0f6e74' : '#7a5800' }}>{c.l}</span>) : <span className="text-gray-400">—</span>}</td>
      <td className="px-3 py-2.5 text-[13px] text-gray-700">{o.bm || '—'}</td>
      <td className="px-3 py-2.5 text-[13px] text-gray-700">{o.auditorName || '—'}</td>
      <td className="px-3 py-2.5">{placedTxt}</td>
      <td className="px-3 py-2.5">{nextTxt}</td>
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

function FollowupDrawer({ order: o, installByPhone, who, onClose }: { order: CoeOrder; installByPhone: Map<string, CoeInstall[]>; who: string; onClose: () => void }) {
  const [, force] = useState(0);
  const [msg, setMsg] = useState('');
  const today = todayStr();
  const t = o.coeTrack || {};
  const calls = coeCalls(o).slice().sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  // Recomputed on every render (including after a save's force() bump) so the
  // drawer reflects o.coeTrack's just-mutated state without waiting for the
  // parent list to refetch.
  const placed = orderPlacedFor(o, installByPhone);
  const cps = checkpointState(o, placed, today);
  const nextDue = cps.filter((c) => c.applies && c.state !== 'done').sort((a, b) => String(a.dueOn || '').localeCompare(String(b.dueOn || '')))[0] || null;
  const row: Row = { o, placed, cps, bucket: bucketFor(o, placed, today), nextDue };

  async function run(mutate: (t: any) => any, logText: string, onOk?: string) {
    try {
      const next = await patchCoe(o.id, mutate, logText, who);
      o.coeTrack = next;
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
            <h2 className="text-base font-bold text-gray-900">{o.name || '—'}</h2>
            <div className="mt-0.5 text-[12.5px] text-gray-400">{o.pi} · audited {o.date ? fmtDateA(o.date) : '—'}</div>
          </div>
          <button className="ml-auto h-7 w-7 shrink-0 rounded-md bg-gray-100 text-gray-500" onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <Sec title="Who to call">
            <KV k="Client" v={<a className="text-blue-600" href={'tel:' + o.phone}>{o.phone || '—'}</a>} />
            <KV k="BM" v={<>{o.bm || '—'}{o.bmEmail ? <> · <a className="text-blue-600" href={'mailto:' + o.bmEmail}>{o.bmEmail}</a></> : null}</>} />
            <KV k="Auditor" v={o.auditorName || '—'} />
            <KV k="Categories" v={categoriesFor(o).map((c) => c.l).join(', ') || '—'} />
            <KV k="Address" v={o.addr ? <a className="text-blue-600" href={mapUrl(o.addr)} target="_blank" rel="noopener noreferrer">📍 {o.addr}</a> : '—'} />
          </Sec>

          <Sec title="Call cadence">
            {cps.map((cp) => <CpRow key={cp.k} cp={cp} />)}
          </Sec>

          <Sec title="Order status">
            <OrderStatusSection row={row} run={run} />
          </Sec>

          <Sec title="Log a call">
            <LogCallForm o={o} nextDue={nextDue} run={run} />
          </Sec>

          <Sec title="Outcome">
            {t.result ? (
              <>
                <div className={`rounded-lg px-3 py-2 text-[12.5px] ${t.result === 'converted' ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                  Marked <b>{t.result}</b>{t.lost_reason ? ' — ' + t.lost_reason : ''}
                </div>
                <button className="mt-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700" onClick={() => run((c) => { delete c.result; delete c.lost_reason; return c; }, 'Outcome reopened by category ops', 'Reopened')}>Reopen</button>
              </>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button className="rounded-md bg-green-700 px-3 py-1.5 text-[12px] font-bold text-white" onClick={() => run((c) => { c.result = 'converted'; delete c.lost_reason; return c; }, 'Marked converted by category ops', 'Marked converted')}>Mark converted</button>
                <button className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700" onClick={() => {
                  const why = window.prompt('Why was this lost? (required)');
                  if (why === null) return;
                  if (!why.trim()) { setMsg('A reason is required'); return; }
                  run((c) => { c.result = 'lost'; c.lost_reason = why.trim(); return c; }, 'Marked lost by category ops — ' + why.trim(), 'Marked lost');
                }}>Mark lost</button>
                <button className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700" onClick={() => {
                  const until = addDays(todayStr(), 7);
                  run((c) => { c.snooze_until = until; return c; }, 'Follow-up snoozed to ' + until + ' by category ops', 'Snoozed to ' + fmtDateA(until));
                }}>Snooze 7 days</button>
              </div>
            )}
            {t.snooze_until && t.snooze_until > today ? <div className="mt-1.5 text-[11.5px] text-gray-400">Snoozed until {fmtDateA(t.snooze_until)}</div> : null}
          </Sec>

          <Sec title="Call history">
            {calls.length ? calls.map((c) => {
              const cp = CHECKPOINTS.find((x) => x.k === c.stage);
              const oc = OUTCOMES.find((x) => x.k === c.outcome);
              return (
                <div key={c.id} className="border-b border-gray-100 py-2 last:border-b-0">
                  <div className="text-[13px] font-bold">{cp ? cp.label : 'Ad-hoc call'} · {c.who === 'bm' ? 'BM' : 'Client'}</div>
                  {c.note ? <div className="mt-0.5 text-[12.5px]">{c.note}</div> : null}
                  <div className="mt-0.5 text-[11.5px] text-gray-400">{oc ? oc.l : (c.outcome || '')} · {fmtLog(c.ts)}{c.by?.name ? ' · ' + c.by.name : ''}</div>
                </div>
              );
            }) : <div className="text-[12.5px] text-gray-400">No calls logged yet.</div>}
          </Sec>

          <Sec title="Order timeline">
            {o.log && o.log.length ? o.log.slice().reverse().slice(0, 30).map((l: any, i: number) => (
              <div key={i} className="border-b border-gray-100 py-2 last:border-b-0">
                <div className="text-[13px] font-bold">{l.who ? <b className="text-[#1F3A5F]">{l.who}</b> : null}{l.who ? ' · ' : ''}{l.t || ''}</div>
                <div className="mt-0.5 text-[11.5px] text-gray-400">{fmtLog(l.d)}</div>
              </div>
            )) : <div className="text-[12.5px] text-gray-400">No activity logged.</div>}
          </Sec>
        </div>

        {msg ? <div className="border-t border-gray-100 bg-blue-50 px-5 py-2 text-[12.5px] font-semibold text-blue-700">{msg}</div> : null}
      </div>
    </div>
  );
}

function CpRow({ cp }: { cp: CheckpointState }) {
  if (!cp.applies) {
    return <div className="flex gap-2.5 border-b border-gray-100 py-2 last:border-b-0"><div className="h-5 w-5 shrink-0 rounded-full bg-gray-100 text-center text-[11px] text-gray-400">–</div><div><div className="text-[13px] font-bold text-gray-400">{cp.label}</div><div className="text-[11.5px] text-gray-400">Not needed — an order was already placed.</div></div></div>;
  }
  const icoCls = cp.state === 'done' ? 'bg-green-100 text-green-700' : cp.state === 'overdue' ? 'bg-red-100 text-red-700' : cp.state === 'due' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400';
  const ico = cp.state === 'done' ? '✓' : cp.state === 'overdue' ? '!' : '•';
  const sub = cp.state === 'done'
    ? 'Called ' + fmtLog(cp.last?.ts) + (cp.last?.by?.name ? ' · ' + cp.last.by.name : '')
    : cp.state === 'overdue' ? `Due ${fmtDateA(cp.dueOn)} · ${daysBetween(cp.dueOn!, todayStr())} days overdue`
      : cp.state === 'due' ? 'Due today'
        : cp.dueOn ? `Due ${fmtDateA(cp.dueOn)}` : 'No audit date on record';
  return (
    <div className="flex gap-2.5 border-b border-gray-100 py-2 last:border-b-0">
      <div className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${icoCls}`}>{ico}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-gray-900">{cp.label}</div>
        <div className="text-[11.5px] text-gray-400">{sub}</div>
        {cp.state !== 'done' ? <div className="text-[11.5px] text-gray-400">{cp.hint}</div> : null}
        {cp.calls.filter((c) => c.note).map((c) => <div key={c.id} className="mt-1 rounded bg-gray-50 px-2 py-1 text-[12px]">{c.note}</div>)}
      </div>
    </div>
  );
}

function OrderStatusSection({ row, run }: { row: Row; run: (mutate: (t: any) => any, logText: string, onOk?: string) => Promise<void> }) {
  const [kind, setKind] = useState('cart');
  const [ref, setRef] = useState('');
  const placed = row.placed;
  if (placed) {
    return (
      <>
        <div className="rounded-lg bg-green-50 px-3 py-2 text-[12.5px] text-green-700">
          ✓ {placed.auto ? 'Installation order found' : 'Marked as ordered by ' + (placed.by?.name || 'the team')}
          {placed.ref ? ' · ' + placed.ref : ''}{placed.at ? ' · ' + fmtLog(placed.at) : ''}
          {placed.auto ? <div className="mt-0.5 font-normal">Matched on this client&#39;s phone number, created on or after the audit date.</div> : null}
        </div>
        {!placed.auto ? (
          <button className="mt-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700" onClick={() => run((c) => { delete c.order_placed; return c; }, 'Order/cart mark removed by category ops', 'Removed')}>Undo this mark</button>
        ) : null}
      </>
    );
  }
  return (
    <>
      <div className="mb-2 rounded-lg bg-gray-50 px-3 py-2 text-[12.5px] text-gray-600">No installation order found for this client since the audit. If they placed a cart or a product-only order this app can&#39;t see, record it here.</div>
      <div className="grid grid-cols-2 gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]">
          <option value="cart">Cart made (not yet an order)</option>
          <option value="product">Product order (no installation)</option>
          <option value="installation">Product + installation order</option>
        </select>
        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Reference (optional)" className="rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
      </div>
      <button
        className="mt-1.5 rounded-md bg-teal-700 px-3 py-1.5 text-[12px] font-bold text-white"
        onClick={() => run((c) => { c.order_placed = { kind, ref: ref.trim(), at: new Date().toISOString() }; return c; }, 'Order/cart recorded by category ops (' + kind + (ref.trim() ? ' · ' + ref.trim() : '') + ')', 'Recorded')}
      >
        Mark as placed
      </button>
    </>
  );
}

function LogCallForm({ o, nextDue, run }: { o: CoeOrder; nextDue: CheckpointState | null; run: (mutate: (t: any) => any, logText: string, onOk?: string) => Promise<void> }) {
  const [stage, setStage] = useState(nextDue?.k || 'adhoc');
  const [whoSpoke, setWhoSpoke] = useState<'client' | 'bm'>('client');
  const [outcome, setOutcome] = useState(OUTCOMES[0].k);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setErr('');
    if (!note.trim()) { setErr("Add a short note on what they said — that's the point of the call log."); return; }
    setBusy(true);
    const cp = CHECKPOINTS.find((x) => x.k === stage);
    await run((t) => {
      (t.calls = t.calls || []).push({ id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), ts: new Date().toISOString(), stage, who: whoSpoke, outcome, note: note.trim() });
      return t;
    }, (cp ? cp.label : 'Ad-hoc call') + ' — ' + (whoSpoke === 'bm' ? 'BM' : 'client') + ': ' + note.trim(), 'Call logged');
    setNote('');
    setBusy(false);
  }

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-2 gap-2">
        <select value={stage} onChange={(e) => setStage(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]">
          {CHECKPOINTS.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
          <option value="adhoc">Ad-hoc call</option>
        </select>
        <select value={whoSpoke} onChange={(e) => setWhoSpoke(e.target.value as 'client' | 'bm')} className="rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]">
          <option value="client">Client</option>
          <option value="bm">BM</option>
        </select>
      </div>
      <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]">
        {OUTCOMES.map((x) => <option key={x.k} value={x.k}>{x.l}</option>)}
      </select>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Their review / reason / next step…" className="mb-1.5 min-h-[56px] w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
      {err ? <div className="mb-1 text-[11.5px] text-red-600">{err}</div> : null}
      <button disabled={busy} onClick={save} className="rounded-md bg-[#1F3A5F] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save call'}</button>
    </div>
  );
}
