'use client';

/* "Which site audit does this installation come from" — the install→audit
   direction of the link `LinkInstallSection` declares from the audit side.

   An installation order marked as a Material Depot audit is a promise that a
   job card exists somewhere; this is what finds it, so the BM can open the room
   measurements the installer is about to work from without leaving their own
   order book.

   HOW A MATCH IS DECIDED, and why it stops where it does:

   - A declared link always wins. `jobCardLinks` stores both directions, so an
     audit a BM has already tied to this installation (from either side) is
     simply read back.
   - Otherwise, candidates are audits sharing the client's EXACT phone digits.
     The two rows practically never share a `pi` — measured on live data, 4 of
     182 Material-Depot-audited installations do — because the audit is raised
     pre-sale and the installation post-sale against the order's PI. Phone is
     all they have in common, which is exactly why CLAUDE.md's
     `jobCardLinks.ts` header says nothing in the data can decide this on its
     own.
   - Exactly one candidate → shown as the match, labelled as matched by phone
     rather than declared, with the audit's date on it so a wrong one is
     visible. 157 of those 182 installations resolve this way.
   - Two or more → NOTHING is picked. A client running two projects shares one
     number, and a best guess here puts the wrong room measurements in front of
     an installer. The BM chooses, and that choice becomes the declared link.
   - None → said plainly, with what to check. An installation flagged as a
     Material Depot audit with no audit on the number usually means the audit
     was booked against a different phone.

   Pre-bookings are never candidates. A `slot_reserved`/`slot_converted` row is
   a held store slot, not the audit that came out of it (see CLAUDE.md, "A
   pre-booking and the audit it becomes are two rows, not one"), and its phone
   is often the store's own — so treating one as the audit would attach a job
   card that does not exist. */

import { Fragment, useCallback, useEffect, useState } from 'react';
import { AuditRoomCard } from './AuditRoomViews';
import { STATUS as AUDIT_STATUS, isPreBooking } from './SiteAuditBmView';
import { linkInstall, loadLinkedAuditPi } from './jobCardLinks';
import { fmtDateA, phoneKey, sbGet, sbPatch } from './siteAuditShared';

const AUDIT_LINK_COLS = 'id,pi,po,phone,customer_name,status,date,auditor_name,created_at';

type AuditCandidate = {
  id: string; pi: string; phone?: string; customer_name?: string;
  status?: string; date?: string | null; auditor_name?: string | null; created_at?: string | null;
};

type Resolution =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'declared'; audit: AuditCandidate }
  | { kind: 'matched'; audit: AuditCandidate }
  | { kind: 'ambiguous'; candidates: AuditCandidate[] }
  | { kind: 'none' };

function auditLine(a: AuditCandidate) {
  const st = a.status ? (AUDIT_STATUS[a.status]?.l || a.status) : '';
  return [a.date ? fmtDateA(a.date) : 'no visit date', a.auditor_name || 'no auditor', st].filter(Boolean).join(' · ');
}

/* Mirrors LinkInstallSection's own log write — the link lives outside both
   rows, so the installation's activity log is the only place an SM or installer
   would see it happen. Re-reads the log first because the field apps autosave
   that same blob. */
async function appendInstallLog(installId: string, text: string, who: string) {
  const rows = await sbGet('install_orders?id=eq.' + installId + '&select=log');
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return [...(row && Array.isArray(row.log) ? row.log : []), { t: text, d: new Date().toISOString(), by: 'manual' as const, who }];
}

export default function LinkAuditSection({ installId, installPi, installPhone, attribution, onMsg }: {
  installId: string;
  installPi: string;
  installPhone?: string;
  /* Who to attribute the declaration to. ABSENT means nobody identifiable is
     looking (a rollup view rendering someone else's orders), and then the
     section is strictly read-only: it still resolves and shows the job card,
     but a link nobody can be named for is not a link worth writing. */
  attribution?: string;
  onMsg: (m: string) => void;
}) {
  const [res, setRes] = useState<Resolution>({ kind: 'loading' });
  const [card, setCard] = useState<{ pi: string; ticked: any } | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const canDeclare = !!attribution;

  const resolve = useCallback(async () => {
    setRes({ kind: 'loading' });
    const declaredPi = await loadLinkedAuditPi(installPi).catch(() => '');
    if (declaredPi) {
      const rows = await sbGet('audit_orders?pi=eq.' + encodeURIComponent(declaredPi) + '&status=neq.deleted&select=' + AUDIT_LINK_COLS);
      /* A declared link whose audit row has since been deleted falls through to
         the candidate search rather than rendering an empty section. */
      if (Array.isArray(rows) && rows[0]) { setRes({ kind: 'declared', audit: rows[0] }); return; }
    }

    const key = phoneKey(installPhone);
    if (!key) { setRes({ kind: 'none' }); return; }
    /* `like` on the last 10 digits rather than `eq` on the raw string: both
       tables are filled in by different apps and either side may carry a +91 or
       spaces. Still exact — the ten digits have to be there — and re-checked
       through phoneKey below so a longer number that merely contains them
       can't slip in. */
    const rows = await sbGet(
      'audit_orders?phone=like.*' + key + '*&status=neq.deleted&order=created_at.desc&select=' + AUDIT_LINK_COLS,
    );
    if (!Array.isArray(rows)) { setRes({ kind: 'failed' }); return; }
    const cands = (rows as AuditCandidate[]).filter((a) => phoneKey(a.phone) === key && !isPreBooking(a));
    if (!cands.length) setRes({ kind: 'none' });
    else if (cands.length === 1) setRes({ kind: 'matched', audit: cands[0] });
    else setRes({ kind: 'ambiguous', candidates: cands });
  }, [installPi, installPhone]);

  useEffect(() => { resolve(); }, [resolve]);

  /* The job card is the heaviest thing on this screen (`audit_ticked` carries
     every room photo), so it is fetched only once an audit is actually
     resolved, and only for that one row. */
  const resolvedAudit = res.kind === 'declared' || res.kind === 'matched' ? res.audit : null;
  useEffect(() => {
    if (!resolvedAudit) { setCard(null); return; }
    let alive = true;
    setCardLoading(true);
    sbGet('audit_orders?id=eq.' + resolvedAudit.id + '&select=audit_ticked')
      .then((rows) => {
        if (!alive) return;
        setCard({ pi: resolvedAudit.pi, ticked: Array.isArray(rows) && rows[0] ? rows[0].audit_ticked : null });
        setCardLoading(false);
      })
      .catch(() => { if (alive) setCardLoading(false); });
    return () => { alive = false; };
  }, [resolvedAudit]);

  async function declare(a: AuditCandidate) {
    if (!attribution) return;
    setBusy(true);
    try {
      await linkInstall(a.pi, installPi, attribution);
      const log = await appendInstallLog(installId, 'Linked to site audit ' + a.pi, attribution);
      await sbPatch('install_orders', installId, { log });
      setPicking(false);
      await resolve();
      onMsg('Site audit ' + a.pi + ' linked to this installation');
    } catch (e: any) {
      onMsg('Could not link — ' + (e?.message || 'try again'));
    }
    setBusy(false);
  }

  const rooms = (card?.ticked && Array.isArray(card.ticked.rooms) && card.ticked.rooms) || [];
  const isDraft = card?.ticked && card.ticked.draft && !(card.ticked.sign && !card.ticked.sign.draft);

  function CandidateRow({ a }: { a: AuditCandidate }) {
    return (
      <button
        disabled={busy || !canDeclare}
        onClick={() => declare(a)}
        className="flex w-full items-center gap-2 border-b border-gray-100 py-2 text-left last:border-b-0 disabled:opacity-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[12px] font-semibold text-gray-900">{a.pi}</span>
          <span className="block truncate text-[11.5px] text-gray-400">{auditLine(a)}</span>
        </span>
        <span className="shrink-0 text-[11.5px] font-semibold text-blue-700">This one</span>
      </button>
    );
  }

  if (res.kind === 'loading') return <div className="text-[12.5px] text-gray-400">Looking for the site audit…</div>;

  if (res.kind === 'failed') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">
        Couldn&apos;t search for the site audit just now — this is a connection problem, not a missing audit.
        <button className="ml-1.5 font-bold underline" onClick={resolve}>Retry</button>
      </div>
    );
  }

  if (res.kind === 'none' || res.kind === 'ambiguous') {
    return (
      <>
        {res.kind === 'none' ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
            <b>No site audit found on this client&apos;s number.</b> This order is marked as a Material Depot audit, so
            the audit was most likely booked against a different phone number — {canDeclare ? 'search for it below and link it, or ask' : 'the BM who owns this order can search for it and link it. Otherwise ask'}{' '}
            the Service Manager to correct the audit type.
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
            <b>{res.candidates.length} site audits share this client&apos;s number.</b>{' '}
            {canDeclare
              ? "Pick the one this installation came from — one number can cover two different projects, so this isn't guessed."
              : "Which one this installation came from can't be told apart from the data, and only the BM who owns the order can say."}
          </div>
        )}
        {res.kind === 'ambiguous' ? <div className="mt-1.5">{res.candidates.map((a) => <CandidateRow key={a.id} a={a} />)}</div> : null}
        {res.kind === 'none' && canDeclare ? <AuditSearch installPi={installPi} busy={busy} onPick={declare} /> : null}
      </>
    );
  }

  const a = res.audit;
  return (
    <>
      <div className="mb-2 rounded-lg border border-gray-200 px-3 py-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[12px] font-semibold text-gray-900">{a.pi}</div>
            <div className="truncate text-[11.5px] text-gray-400">{auditLine(a)}</div>
          </div>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${res.kind === 'declared' ? 'bg-green-100 text-green-700' : 'bg-sky-100 text-sky-700'}`}>
            {res.kind === 'declared' ? 'Linked' : 'Matched by phone'}
          </span>
        </div>
        {res.kind === 'matched' && canDeclare ? (
          <button className="mt-1 text-[11.5px] font-semibold text-blue-700" onClick={() => setPicking((v) => !v)}>
            {picking ? 'Cancel' : 'Not the right audit?'}
          </button>
        ) : null}
      </div>

      {picking ? <AuditSearch installPi={installPi} busy={busy} onPick={declare} /> : null}

      {cardLoading ? <div className="text-[12.5px] text-gray-400">Loading the job card…</div>
        : !rooms.length ? <div className="text-[12.5px] text-gray-400">This audit has no job card recorded — it may not have been completed yet.</div>
          : (
            <>
              {isDraft
                ? <div className="mb-2.5 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-bold text-amber-800">⚠️ Job card is still a draft — not yet signed off by the client.</div>
                : card?.ticked?.sign ? <div className="mb-2.5 rounded-lg bg-green-50 px-3 py-2 text-[12.5px] font-bold text-green-700">✓ Signed off by the client{card.ticked.sign.name ? ' — ' + card.ticked.sign.name : ''}</div> : null}
              {rooms.map((r: any, i: number) => <Fragment key={i}><AuditRoomCard room={r} index={i} /></Fragment>)}
            </>
          )}
    </>
  );
}

/* Free search for the audit, for the cases the phone can't resolve — the same
   shape LinkInstallSection's picker uses, pointed the other way. */
function AuditSearch({ installPi, busy, onPick }: { installPi: string; busy: boolean; onPick: (a: AuditCandidate) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AuditCandidate[] | null>(null);

  async function search() {
    const term = q.trim();
    if (!term) { setResults(null); return; }
    const enc = encodeURIComponent(term);
    const rows = await sbGet(
      'audit_orders?or=(pi.ilike.*' + enc + '*,customer_name.ilike.*' + enc + '*,phone.ilike.*' + enc + '*)'
      + '&status=neq.deleted&order=created_at.desc&limit=15&select=' + AUDIT_LINK_COLS,
    );
    setResults(Array.isArray(rows) ? (rows as AuditCandidate[]).filter((a) => !isPreBooking(a)) : []);
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 p-2.5">
      <div className="flex gap-2">
        <input
          value={q}
          placeholder="Search audits by lead id, customer or phone"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          className="min-w-0 flex-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#0F766E]"
        />
        <button className="shrink-0 rounded-md bg-[#1F3A5F] px-3 py-1.5 text-[12px] font-semibold text-white" onClick={search}>Search</button>
      </div>
      <div className="mt-1 text-[11px] text-gray-400">Linking here also shows this installation on the audit&apos;s own drawer ({installPi}).</div>
      {results === null ? null : !results.length ? (
        <div className="mt-2 text-[12px] text-gray-400">No site audits match.</div>
      ) : (
        <div className="mt-2">
          {results.map((a) => (
            <button
              key={a.id}
              disabled={busy}
              onClick={() => onPick(a)}
              className="flex w-full items-center gap-2 border-b border-gray-100 py-2 text-left last:border-b-0 disabled:opacity-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[12px] font-semibold text-gray-900">{a.pi}</span>
                <span className="block truncate text-[11.5px] text-gray-400">{auditLine(a)}</span>
              </span>
              <span className="shrink-0 text-[11.5px] font-semibold text-blue-700">Link</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
