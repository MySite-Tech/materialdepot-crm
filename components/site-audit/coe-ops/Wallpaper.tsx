'use client';

import { useMemo, useState } from 'react';
import { fmtLog } from '../siteAuditShared';
import { createWpRow, patchWp, stampWpStage, todayStr, type CoeInstall } from './shared';
import WpLadder from './WpLadder';
import { KV, Sec } from '../drawerUi';
import { useNoteModal } from '../NoteModal';
import {
  WP_BUCKETS, WP_DECISIONS, WP_VENDORS, wpBucket, wpFmtDur, wpNext, wpRounds,
  wpSla, wpVendor, type WpBucketKey, type WpNext, type WpRow, type WpSla,
} from './wpTrack';

type Derived = { r: WpRow; next: WpNext | null; sla: WpSla; bucket: WpBucketKey };

function firstNonEmpty(order: string[], counts: Record<string, number>, fallback: string): string {
  for (const k of order) if (counts[k]) return k;
  return fallback;
}

function exportWpCsv(list: Derived[]) {
  const cell = (v: any) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['Order Placed Date', 'MD ID', 'ENQ ID', 'Vendor', 'Client', 'Phone', 'BM', 'Rounds', 'State', 'Waiting on', 'Hours at step', 'Details / Product / Issue'];
  const body = list.map((x) => {
    const r = x.r;
    return [
      r.order_placed_at ? String(r.order_placed_at).slice(0, 10) : '', r.md_id, r.pi, wpVendor(r.vendor).label,
      r.customer_name, r.phone, r.bm, wpRounds(r).length, r.state, x.next ? x.next.label : '—',
      x.next ? Math.round(x.sla.hours) : '', r.notes || '',
    ].map(cell).join(',');
  });
  const blob = new Blob([[head.map(cell).join(',')].concat(body).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'custom-wallpaper-production-' + todayStr() + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Wallpaper({ rows, installs, who, city, onChanged }: {
  rows: WpRow[]; installs: CoeInstall[]; who: string; city: string | null; onChanged: () => void;
}) {
  const [bucket, setBucket] = useState<WpBucketKey>('breach');
  const [bucketPicked, setBucketPicked] = useState(false);
  const [vendorFilter, setVendorFilter] = useState('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<CoeInstall | null | 'new'>(null);

  const all = useMemo<Derived[]>(() => {
    const now = Date.now();
    return rows.map((r) => ({ r, next: wpNext(r), sla: wpSla(r, now), bucket: wpBucket(r, now) }));
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    WP_BUCKETS.forEach((b) => { c[b.k] = 0; });
    all.forEach((x) => { c[x.bucket] = (c[x.bucket] || 0) + 1; });
    return c;
  }, [all]);

  let activeBucket = bucket;
  if (!bucketPicked && !counts[bucket]) activeBucket = firstNonEmpty(WP_BUCKETS.map((b) => b.k), counts, bucket) as WpBucketKey;

  const qLower = q.toLowerCase();
  const list = all.filter((x) => x.bucket === activeBucket)
    .filter((x) => vendorFilter === 'all' || x.r.vendor === vendorFilter)
    .filter((x) => !qLower || [x.r.pi, x.r.md_id, x.r.customer_name, x.r.phone, x.r.bm].join(' ').toLowerCase().includes(qLower))
    .sort((a, b) => (b.sla.hours || 0) - (a.sla.hours || 0));

  // Install orders flagged custom_wp that have no production row yet.
  // Surfaced as a suggestion strip — never auto-created.
  const known = useMemo(() => new Set(rows.map((r) => String(r.pi || '').trim()).filter(Boolean)), [rows]);
  const seeds = installs.filter((io) => io.customWp && io.pi && !known.has(io.pi.trim()));

  const openRow = openId ? all.find((x) => x.r.id === openId) || null : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div>
          <h1 className="text-lg font-bold text-black">Custom wallpaper production</h1>
          <p className="text-[13px] text-gray-400">One row per PO. Dimensions → render → BM → client approval → printing → dispatch → warehouse → delivery → installation, with the vendor&#39;s own hour targets on each step.</p>
        </div>
        <div className="ml-auto flex shrink-0 gap-2">
          <button onClick={() => exportWpCsv(all)} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700">⬇ CSV</button>
          <button onClick={() => setAdding('new')} className="rounded-md bg-teal-700 px-3 py-1.5 text-[12px] font-bold text-white">+ Add wallpaper order</button>
        </div>
      </div>

      {seeds.length ? (
        <div className="mb-3 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2.5 text-[13px] text-teal-800">
          <b>{seeds.length} custom wallpaper order{seeds.length === 1 ? '' : 's'} not being tracked yet.</b>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {seeds.slice(0, 8).map((s) => (
              <button key={s.pi} onClick={() => setAdding(s)} className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-gray-700">{s.name || s.pi} · {s.pi}</button>
            ))}
            {seeds.length > 8 ? <span className="self-center text-[12px]">+{seeds.length - 8} more</span> : null}
          </div>
        </div>
      ) : null}

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {WP_BUCKETS.map((b) => (
          <button
            key={b.k}
            onClick={() => { setBucket(b.k); setBucketPicked(true); }}
            className={`rounded-lg border px-3 py-2.5 text-left ${activeBucket === b.k ? 'border-[#1F3A5F] bg-[#eef3f9]' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
          >
            <div className={`text-[20px] font-extrabold leading-tight ${b.k === 'breach' ? 'text-red-600' : b.k === 'approval' ? 'text-amber-600' : b.k === 'completed' ? 'text-green-700' : 'text-[#1F3A5F]'}`}>{counts[b.k] || 0}</div>
            <div className="mt-0.5 text-[11px] font-semibold text-gray-500">{b.l}</div>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-[320px] flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">🔎</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client, ENQ, MD ID, BM…" className="w-full rounded-md border border-gray-200 py-2 pl-8 pr-3 text-[13.5px] outline-none focus:border-yellow-400" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setVendorFilter('all')} className={vendorFilter === 'all' ? 'rounded-full bg-[#1A1A1A] px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600'}>All vendors</button>
          {WP_VENDORS.map((v) => (
            <button key={v.k} onClick={() => setVendorFilter(v.k)} className={vendorFilter === v.k ? 'rounded-full bg-[#1A1A1A] px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600'}>{v.label}</button>
          ))}
        </div>
        <div className="text-[12px] text-gray-400">{all.length} tracked</div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        {list.length ? (
          <table className="w-full">
            <thead>
              <tr>{['Client', 'IDs', 'Vendor', 'Round', 'Waiting on', 'Time at step'].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {list.map((x) => <WpRowLine key={x.r.id} x={x} onOpen={() => setOpenId(x.r.id)} />)}
            </tbody>
          </table>
        ) : (
          <div className="py-12 text-center text-[13px] text-gray-400">
            <div className="mb-2 text-2xl">{rows.length ? '🔎' : '🖼️'}</div>
            {rows.length ? 'Nothing in this bucket.' : 'No wallpaper orders tracked yet — add one, or pick a suggestion above.'}
          </div>
        )}
      </div>

      {openRow ? <WpDrawer x={openRow} who={who} onClose={() => { setOpenId(null); onChanged(); }} /> : null}
      {adding ? <WpAddDrawer seed={adding === 'new' ? null : adding} who={who} city={city} onClose={() => setAdding(null)} onCreated={(id) => { setAdding(null); onChanged(); setOpenId(id); }} /> : null}
    </div>
  );
}

function WpRowLine({ x, onOpen }: { x: Derived; onOpen: () => void }) {
  const r = x.r;
  const rounds = wpRounds(r);
  const lvl = x.sla.level;
  const cls = lvl === 'breach' ? 'bg-red-100 text-red-700' : lvl === 'stalled' || lvl === 'soon' ? 'bg-amber-100 text-amber-700' : lvl === 'none' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700';
  const waiting = x.next
    ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{x.next.label}</span>
    : (r.state === 'cancelled' ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-500">PO cancelled</span> : <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">Complete</span>);
  const timeTxt = x.next && x.sla.from
    ? <span className={lvl === 'breach' ? 'font-bold text-red-600' : lvl === 'stalled' || lvl === 'soon' ? 'font-bold text-amber-600' : 'text-gray-400'}>{wpFmtDur(x.sla.hours)}{x.sla.slaH ? ' / ' + x.sla.slaH + 'h' : ''}</span>
    : <span className="text-gray-400">—</span>;
  return (
    <tr onClick={onOpen} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-2.5 text-[13px]">
        <div className="font-bold text-gray-900">{r.customer_name || '—'}</div>
        <div className="text-[11.5px] text-gray-400">{r.phone ? r.phone : <span className="font-bold text-amber-600">no contact yet</span>}{r.bm ? ' · ' + r.bm : ''}</div>
      </td>
      <td className="px-3 py-2.5 text-[13px]"><div>{r.md_id || '—'}</div><div className="text-[11.5px] text-gray-400">{r.pi || ''}</div></td>
      <td className="px-3 py-2.5 text-[13px] text-gray-700">{wpVendor(r.vendor).label}</td>
      <td className="px-3 py-2.5 text-[13px]">{rounds.length > 1 ? <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10.5px] font-bold text-teal-700">Round {rounds.length}</span> : '1'}</td>
      <td className="px-3 py-2.5">{waiting}</td>
      <td className="px-3 py-2.5 text-[13px]">{timeTxt}</td>
    </tr>
  );
}

function WpDrawer({ x, who, onClose }: { x: Derived; who: string; onClose: () => void }) {
  const [row, setRow] = useState(x.r);
  const [msg, setMsg] = useState('');
  const v = wpVendor(row.vendor);
  const next = wpNext(row);
  const isApproval = next?.k === 'client_approval';

  return (
    <div className="fixed inset-0 z-[900] flex justify-end bg-black/30" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl">
        <div className="flex items-start gap-2 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">{row.customer_name || '—'}</h2>
            <div className="mt-0.5 text-[12.5px] text-gray-400">{row.md_id || '—'} · {row.pi || '—'} · {v.label}</div>
          </div>
          <button className="ml-auto h-7 w-7 shrink-0 rounded-md bg-gray-100 text-gray-500" onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <Sec title="Who to call">
            <KV k="Client" v={row.phone ? <a className="text-blue-600" href={'tel:' + row.phone}>{row.phone}</a> : '—'} />
            <KV k="BM" v={row.bm || '—'} />
            <KV k="Vendor" v={<>{v.label}{v.note ? <span className="text-gray-400"> · {v.note}</span> : null}</>} />
            <KV k="Order placed" v={row.order_placed_at ? fmtLog(row.order_placed_at) : '—'} />
          </Sec>

          <Sec title="Production ladder"><WpLadder row={row} /></Sec>

          {next ? (
            <Sec title="Mark the next step done">
              <MarkDoneForm row={row} next={next} isApproval={!!isApproval} who={who} onSaved={(r) => { setRow(r); setMsg('Updated'); }} onErr={setMsg} />
            </Sec>
          ) : (
            <Sec title="">
              <div className="rounded-lg bg-green-50 px-3 py-2 text-[12.5px] text-green-700">{row.state === 'cancelled' ? 'This PO was cancelled — nothing further to do.' : 'Every step is complete.'}</div>
            </Sec>
          )}

          <Sec title="Order details">
            <OrderDetailsForm row={row} who={who} onSaved={(r, m) => { setRow(r); setMsg(m); }} />
          </Sec>

          <Sec title="Activity">
            {Array.isArray(row.log) && row.log.length ? row.log.slice().reverse().map((l, i) => (
              <div key={i} className="border-b border-gray-100 py-2 last:border-b-0">
                <div className="text-[13px] font-bold">{l.t || ''}</div>
                <div className="mt-0.5 text-[11.5px] text-gray-400">{fmtLog(l.d)}{l.who ? ' · ' + l.who : ''}</div>
              </div>
            )) : <div className="text-[12.5px] text-gray-400">Nothing logged yet.</div>}
          </Sec>
        </div>

        {msg ? <div className="border-t border-gray-100 bg-blue-50 px-5 py-2 text-[12.5px] font-semibold text-blue-700">{msg}</div> : null}
      </div>
    </div>
  );
}

function MarkDoneForm({ row, next, isApproval, who, onSaved, onErr }: {
  row: WpRow; next: WpNext; isApproval: boolean; who: string; onSaved: (r: WpRow) => void; onErr: (m: string) => void;
}) {
  const [decision, setDecision] = useState(WP_DECISIONS[0].k);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    onErr('');
    if (isApproval && (decision === 'changes_suggested' || decision === 'cancelled') && !note.trim()) {
      onErr('A note is required — it is the only record of why this looped or stopped.');
      return;
    }
    setBusy(true);
    try {
      const updated = await stampWpStage(row, next, { note: note.trim(), decision: isApproval ? decision : null }, who);
      onSaved(updated);
      setNote('');
    } catch (e: any) {
      onErr('Failed — ' + (e?.message || 'try again'));
    }
    setBusy(false);
  }

  return (
    <div>
      <div className="mb-1.5 rounded-lg bg-gray-50 px-3 py-2 text-[12.5px]">
        Next: <b>{next.label}</b>{next.redo ? ' — the client asked for changes, so this opens round ' + (wpRounds(row).length + 1) + '.' : ''}
      </div>
      {isApproval ? (
        <>
          <label className="mb-1 block text-[11.5px] font-semibold text-gray-500">What did the client say?</label>
          <select value={decision} onChange={(e) => setDecision(e.target.value as any)} className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]">
            {WP_DECISIONS.map((d) => <option key={d.k} value={d.k}>{d.l}</option>)}
          </select>
        </>
      ) : null}
      <label className="mb-1 block text-[11.5px] font-semibold text-gray-500">Note {isApproval ? '(required for changes / cancellation)' : '(optional)'}</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened at this step…" className="mb-1.5 min-h-[56px] w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
      <button disabled={busy} onClick={save} className="rounded-md bg-[#1F3A5F] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Mark done'}</button>
    </div>
  );
}

function OrderDetailsForm({ row, who, onSaved }: { row: WpRow; who: string; onSaved: (r: WpRow, m: string) => void }) {
  const [name, setName] = useState(row.customer_name || '');
  const [phone, setPhone] = useState(row.phone || '');
  const [bm, setBm] = useState(row.bm || '');
  const [notes, setNotes] = useState(row.notes || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  /* Both required reasons below were window.prompt(), which is the landmine in
     CLAUDE.md: it silently no-ops in installed PWAs and mobile webviews, and
     desktop Chrome disables it per-origin for good once a user ticks "prevent
     additional dialogs" — so Put on hold and Cancel PO just did nothing, with no
     error anywhere. Same contract as before (a blank or cancelled reason
     ABORTS), real DOM. */
  const note = useNoteModal();

  async function saveDetails() {
    setErr('');
    const changed: string[] = [];
    if (name.trim() !== (row.customer_name || '')) changed.push('client name');
    if (phone.trim() !== (row.phone || '')) changed.push('phone');
    if (bm.trim() !== (row.bm || '')) changed.push('BM');
    setBusy(true);
    try {
      const updated = await patchWp(row, (cur) => {
        cur.customer_name = name.trim() || null as any;
        cur.phone = phone.trim() || null as any;
        cur.bm = bm.trim() || null as any;
        cur.notes = notes.trim();
        return cur;
      }, changed.length ? 'Order details updated (' + changed.join(', ') + ')' : 'Notes updated', who);
      onSaved(updated, 'Saved');
    } catch (e: any) {
      setErr('Failed — ' + (e?.message || 'try again'));
    }
    setBusy(false);
  }

  async function toggleHold() {
    const to = row.state === 'on_hold' ? 'active' : 'on_hold';
    let why = '';
    if (to === 'on_hold') {
      const v = await note.ask('Why is this on hold?', 'A held PO stops appearing as due, so the reason is the only record of what the vendor or client is waiting on.');
      if (!v) return;
      why = v;
    }
    try {
      const updated = await patchWp(row, (cur) => { cur.state = to as any; return cur; }, to === 'on_hold' ? 'Put on hold — ' + why : 'Resumed', who);
      onSaved(updated, to === 'on_hold' ? 'On hold' : 'Resumed');
    } catch (e: any) {
      setErr('Failed — ' + (e?.message || 'try again'));
    }
  }
  async function cancelPo() {
    const v = await note.ask('Why is this PO being cancelled?', 'Cancelling retires this production run for good, so the reason is what the next person reads instead of re-raising it.');
    if (!v) return;
    try {
      const updated = await patchWp(row, (cur) => { cur.state = 'cancelled'; return cur; }, 'PO cancelled — ' + v, who);
      onSaved(updated, 'PO cancelled');
    } catch (e: any) {
      setErr('Failed — ' + (e?.message || 'try again'));
    }
  }

  return (
    <div>
      {!row.phone ? (
        <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
          No customer details on this order. It came from the vendor sheet, which never recorded them, and its enquiry ID isn&#39;t in this app — so there was nothing to look them up from. Add them here to make it callable.
        </div>
      ) : null}
      <div className="mb-1.5 grid grid-cols-2 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" className="rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Client phone" className="rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
      </div>
      <input value={bm} onChange={(e) => setBm(e.target.value)} placeholder="BM" className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (product / issue)" className="mb-1.5 min-h-[56px] w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
      {err ? <div className="mb-1 text-[11.5px] text-red-600">{err}</div> : null}
      <div className="flex flex-wrap gap-1.5">
        <button disabled={busy} onClick={saveDetails} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700 disabled:opacity-60">Save details</button>
        {row.state !== 'cancelled' ? <button onClick={toggleHold} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700">{row.state === 'on_hold' ? 'Resume' : 'Put on hold'}</button> : null}
        {row.state !== 'cancelled' ? <button onClick={cancelPo} className="rounded-md bg-red-600 px-3 py-1.5 text-[12px] font-bold text-white">Cancel PO</button> : null}
      </div>
      {note.modal}
    </div>
  );
}

function WpAddDrawer({ seed, who, city, onClose, onCreated }: { seed: CoeInstall | null; who: string; city: string | null; onClose: () => void; onCreated: (id: string) => void }) {
  const [pi, setPi] = useState(seed?.pi || '');
  const [md, setMd] = useState((seed?.po && seed.po[0]) || '');
  const [vendor, setVendor] = useState(WP_VENDORS[0].k);
  const [name, setName] = useState(seed?.name || '');
  const [phone, setPhone] = useState(seed?.phone || '');
  const [bm, setBm] = useState('');
  const [notes, setNotes] = useState('');
  const [placedAt, setPlacedAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    setErr('');
    const piT = pi.trim(), mdT = md.trim();
    if (!piT) { setErr('Enquiry ID is required.'); return; }
    if (!mdT) { setErr('MD ID / PO is required — it is what makes this row unique.'); return; }
    setBusy(true);
    try {
      const row = await createWpRow({
        pi: piT, md_id: mdT, vendor, customer_name: name.trim(), phone: phone.trim(), bm: bm.trim(), notes: notes.trim(),
        order_placed_at: placedAt ? new Date(placedAt).toISOString() : new Date().toISOString(),
        install_order_id: seed?.id || null, city: city && city !== 'all' ? city : 'Bengaluru',
      }, who);
      onCreated(row?.id);
    } catch (e: any) {
      setErr('Failed — ' + (e?.message || 'try again') + (/duplicate|unique/i.test(e?.message || '') ? ' (that ENQ + MD ID is already being tracked)' : ''));
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-[900] flex justify-end bg-black/30" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl">
        <div className="flex items-start gap-2 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Add wallpaper order</h2>
            <div className="mt-0.5 text-[12.5px] text-gray-400">{seed ? 'Pre-filled from installation order ' + seed.pi : 'One row per PO — the same enquiry can have several.'}</div>
          </div>
          <button className="ml-auto h-7 w-7 shrink-0 rounded-md bg-gray-100 text-gray-500" onClick={onClose}>✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-1.5 grid grid-cols-2 gap-2">
            <input value={pi} onChange={(e) => setPi(e.target.value)} placeholder="Enquiry ID (ENQ)" className="rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
            <input value={md} onChange={(e) => setMd(e.target.value)} placeholder="MD ID / PO" className="rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
          </div>
          <select value={vendor} onChange={(e) => setVendor(e.target.value)} className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]">
            {WP_VENDORS.map((v) => <option key={v.k} value={v.k}>{v.label} — dispatches from {v.dispatchFrom}</option>)}
          </select>
          <div className="mb-1.5 grid grid-cols-2 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" className="rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Client phone" className="rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
          </div>
          <div className="mb-1.5 grid grid-cols-2 gap-2">
            <input value={bm} onChange={(e) => setBm(e.target.value)} placeholder="Business manager" className="rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
            <input type="datetime-local" value={placedAt} onChange={(e) => setPlacedAt(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Design, size, anything already flagged…" className="mb-1.5 min-h-[56px] w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
          {err ? <div className="mb-1 text-[11.5px] text-red-600">{err}</div> : null}
          <button disabled={busy} onClick={create} className="rounded-md bg-teal-700 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60">{busy ? 'Creating…' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
