'use client';

/* Standalone job-card page, addressed by the lead the order was raised
   against: `/job-card?pi=ENQ2026081084787`.

   Exists so other MD apps can link straight to a job card instead of
   reimplementing it. Procurement (CRA + antd, its own PDF stack) would
   otherwise need a second copy of the room cards, the photo handling and the
   PDF builder, and a second copy of the Site Audit anon key; one link keeps a
   single job-card surface across the apps.

   A job has TWO cards — the site audit and the installation — and in practice
   they never share a `pi`. The audit is raised pre-sale, under a store booking
   (`SRES-…`) or the enquiry of the day; the installation is raised post-sale
   against the order's PI, which is the ENQ procurement links with. So a `pi`
   lookup finds ONE of them, and `matched_audit` is a flag, not a reference.

   Nothing can recover the pair automatically — a client with two unrelated
   projects shares a phone number too — so a BM states it in Site Audit › BM
   dashboard, and this page follows that link in both directions (see
   jobCardLinks.ts): open the audit's id and its installations appear, open the
   installation's id and its audit does. Those sections are labelled as linked
   by the BM, since they are an assertion rather than a shared id. Both tables
   are still read by `pi` — cheap, and correct on the rare row that does match.

   Deliberately outside the CRM's tab shell (app/App.tsx) — this opens in a new
   tab from another app and should show the cards and nothing else. Requires an
   existing CRM session, checked the same way /site-audit-view does: this is
   real customer site data, not the public /store-booking kiosk. */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { JobDetailModal } from '@/components/site-audit/SiteAuditJobsView';
import { JOB_STATUS, fmtDateA, sbGet } from '@/components/site-audit/siteAuditShared';
import { loadLinkedAuditPi, loadLinkedInstallPis } from '@/components/site-audit/jobCardLinks';

const LINKED_ATTRIBUTION = 'Job Card link (CRM)';

/* Each card refetches its own row (rooms carry site photos), so only the first
   is open on load — the rest cost nothing until someone asks for them. */
const OPEN_BY_DEFAULT = 1;

type Card = {
  pi: string;
  type: 'audit' | 'install';
  status: string;
  date: string | null;
  customer: string;
  phone: string;
  via: 'lead' | 'linked';
};

function toCards(rows: any, type: 'audit' | 'install', via: 'lead' | 'linked'): Card[] {
  return (Array.isArray(rows) ? rows : [])
    .filter((r: any) => r.pi)
    .map((r: any) => ({
      pi: r.pi,
      type,
      status: r.status || '',
      date: (type === 'audit' ? r.date : r.delivery_date) || null,
      customer: r.customer_name || '',
      phone: r.phone || '',
      via,
    }));
}

const AUDIT_COLS = 'select=pi,status,date,customer_name,phone';
const INSTALL_COLS = 'select=pi,status,delivery_date,customer_name,phone';

function quoteList(values: string[]): string {
  return values.map((v) => '"' + v.replace(/"/g, '') + '"').join(',');
}

async function findCards(pi: string): Promise<Card[]> {
  const enc = encodeURIComponent(pi);
  const byPi = 'pi=eq.' + enc + '&order=created_at.desc&limit=20';
  const [auditRows, installRows] = await Promise.all([
    sbGet('audit_orders?' + byPi + '&' + AUDIT_COLS),
    sbGet('install_orders?' + byPi + '&' + INSTALL_COLS),
  ]);
  const audits = toCards(auditRows, 'audit', 'lead');
  const installs = toCards(installRows, 'install', 'lead');

  /* Both directions of the BM's declared link: this id may be the audit that
     owns installations, or the installation that names its audit. */
  const [installPis, auditPi] = await Promise.all([
    loadLinkedInstallPis(pi),
    loadLinkedAuditPi(pi),
  ]);

  const wanted = installPis.filter((p) => p !== pi);
  const linkedInstalls = wanted.length
    ? toCards(await sbGet('install_orders?pi=in.(' + quoteList(wanted) + ')&limit=10&' + INSTALL_COLS), 'install', 'linked')
    : [];
  const linkedAudits = auditPi && auditPi !== pi
    ? toCards(await sbGet('audit_orders?pi=eq.' + encodeURIComponent(auditPi) + '&limit=5&' + AUDIT_COLS), 'audit', 'linked')
    : [];

  const all = [...audits, ...linkedAudits, ...installs, ...linkedInstalls];
  const seen = new Set<string>();
  return all.filter((c) => {
    const k = c.type + '|' + c.pi;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center px-6 text-center text-sm text-gray-400">{children}</div>;
}

function CardSection({ card, defaultOpen }: { card: Card; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const label = card.type === 'audit' ? 'Site Audit' : 'Installation';
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-5 py-3 text-left">
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${card.type === 'audit' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
          {label}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[12px] font-semibold text-gray-900">{card.pi}</span>
          <span className="block text-[11px] text-gray-400">
            {card.customer || '—'} · {card.date ? fmtDateA(card.date) : 'no date'}
            {card.via === 'linked' ? ' · linked by BM' : ''}
          </span>
        </span>
        <span className="shrink-0 text-[11px] font-semibold text-gray-500">{(JOB_STATUS[card.status] || { l: card.status || '—' }).l}</span>
        <span className="shrink-0 text-[11px] text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <div className="border-t border-gray-100">
          <JobDetailModal pi={card.pi} type={card.type} closeModal={() => {}} attribution={LINKED_ATTRIBUTION} hideClose />
        </div>
      ) : null}
    </div>
  );
}

function JobCardPageInner() {
  const pi = (useSearchParams().get('pi') || '').trim();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    try {
      setLoggedIn(!!localStorage.getItem('materialdepot_user'));
    } catch {
      setLoggedIn(false);
    }
  }, []);

  useEffect(() => {
    if (!pi || loggedIn !== true) return;
    let alive = true;
    findCards(pi)
      .then((rows) => { if (alive) setCards(rows); })
      .catch(() => { if (alive) { setCards([]); setFailed(true); } });
    return () => { alive = false; };
  }, [pi, loggedIn]);

  if (loggedIn === null) return <Centered>Loading…</Centered>;
  if (!loggedIn) {
    return (
      <Centered>
        <span className="text-gray-500">
          Please <a href="/" className="font-semibold text-[#EAB308] underline">log in to the CRM</a> first, then reopen this link.
        </span>
      </Centered>
    );
  }
  if (!pi) return <Centered>No lead id in the link — expected /job-card?pi=ENQ…</Centered>;

  const audits = cards ? cards.filter((c) => c.type === 'audit').length : 0;
  const installs = cards ? cards.filter((c) => c.type === 'install').length : 0;
  const counts = cards ? audits + ' audit · ' + installs + ' installation' : '';
  const missing = !cards || !cards.length ? '' : !audits ? 'site audit' : !installs ? 'installation' : '';

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
        <div className="text-sm font-bold text-gray-900">Job Cards</div>
        <div className="font-mono text-[11px] text-gray-400">{pi}{counts ? <span className="font-sans"> · {counts}</span> : null}</div>
      </header>
      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
        {cards === null ? (
          <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" />
          </div>
        ) : !cards.length ? (
          <div className="rounded-lg border border-gray-200 bg-white px-6 py-8 text-center text-[13px] text-gray-400">
            {failed
              ? 'Could not reach Site Audit — try again in a moment.'
              : 'No site audit or installation order has been raised against this lead.'}
          </div>
        ) : (
          <>
            {cards.map((c, i) => <CardSection key={c.type + c.pi + i} card={c} defaultOpen={i < OPEN_BY_DEFAULT} />)}
            {/* The two cards live under different ids, so a missing one is the
                normal state of "not linked yet" — not an error, and not
                something this page can resolve on its own. */}
            {missing ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-4 py-3 text-[12.5px] text-gray-500">
                No {missing} job card is linked to this one. If the job has one, a BM can link it from
                Site Audit › BM dashboard — open the site audit and use <b>Linked Installation</b>.
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default function JobCardPage() {
  return (
    <Suspense fallback={<Centered>Loading…</Centered>}>
      <JobCardPageInner />
    </Suspense>
  );
}
