'use client';

// ── Leads tab ────────────────────────────────────────────────────────────────
// Implements `Leads_Tab_PRD.docx` v1.0 (KK, Business Head – B2B).
//
// One unified view across every lead in the B2B CRM, whichever module it came
// from: a list for scanning and filtering, and a detail panel for drilling in.
// This tab CAPTURES NOTHING — every row originates in Inbound or Outreach, and
// the Enquiry ID, order value and line items come from the deal tickets. The
// only field editable here is "Assisted at EC", because the PRD puts it on this
// screen and it belongs to neither source form.
//
// The row shape, the binary status, and the three-state Expected date of
// closure are decided in `lib/b2bLeads.ts` (`fetchUnifiedLeads`) — see the
// comment there for why Lost leads stay visible and why Inbound reports "n/a"
// rather than "not set" for expected closure.

import { useEffect, useMemo, useState } from 'react';
import {
  fetchUnifiedLeads, lookupEnqId, upsertOutreachLead, upsertInboundLead,
  type UnifiedLead, type LeadSource, type UnifiedStatus, type EnqLookup,
} from '@/lib/b2bLeads';
import { fmtINR, KAMS, type InboundLead, type OutreachLead } from './mockData';
import { companyTypeLabel } from './outreachModel';
import {
  SectionCard, Field, ReadValue, Spinner, Empty, LeadName, Pill, StatusBadge,
  inputCls, fmtDay, fmtLeadDateTime,
} from './inboundChips';
import { OutreachStatusBadge, MeetingLine } from './outreachChips';
import EcPicker from './EcPicker';
import {
  ExportButton, exportRowsCsv, exportRowsExcel, todayStr,
  type ExportFormat, type ExportScope,
} from './exportUtils';

const SOURCE_COLORS: Record<LeadSource, string> = {
  Inbound:  '#3B82F6',
  Outreach: '#EAB308',
};

const STATUS_COLORS: Record<UnifiedStatus, string> = {
  'Closed':       '#22C55E',
  'Yet to Close': '#64748B',
};

// ── Export: the PRD's list-view columns ──────────────────────────────────────
const EXPORT_HEADERS = [
  'Company Name', 'GST', 'Contact Number', 'Enquiry ID', 'Order Value',
  'Expected Date of Closure', 'KAM', 'Source', 'Spok', 'Status', 'Lost',
  'Source status',
];

const toExportRow = (l: UnifiedLead): (string | number)[] => [
  l.companyName || '',
  l.gstNumber || '',
  l.phone || '',
  l.enqId || '',
  l.orderValue || '',
  // Three states, not two — an Inbound lead has no such field at all.
  l.hasExpectedClosureField ? (l.expectedClosure || '') : 'n/a (inbound)',
  l.kam || '',
  l.source,
  l.spok || '',
  l.status,
  l.lost ? 'Lost' : '',
  l.sourceStatus,
];

function SourceChip({ s }: { s: LeadSource }) {
  return <Pill color={SOURCE_COLORS[s]}>{s}</Pill>;
}

/**
 * The PRD's binary status, with the Lost outcome kept visible beside it.
 *
 * Open question #1 asks whether Lost leads belong here at all. Dropping them
 * hides the outcome the business most wants to count; folding them silently
 * into "Yet to Close" claims a dead lead is still being worked. So the binary
 * value renders exactly as written and the Lost mark sits next to it.
 */
function UnifiedStatusCell({ lead }: { lead: UnifiedLead }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Pill color={STATUS_COLORS[lead.status]}>{lead.status}</Pill>
      {lead.lost && <Pill color="#EF4444" title={lead.outreach?.lostReason || lead.inbound?.lostReason || 'No reason recorded'}>Lost</Pill>}
    </span>
  );
}

/** Expected closure: a date, "not set", or "not a field on this source". */
function ExpectedClosureCell({ lead }: { lead: UnifiedLead }) {
  if (!lead.hasExpectedClosureField) {
    return (
      <span
        className="text-gray-300 text-[11px]"
        title="Inbound leads have no expected-closure field — the Kylas value is auto-stamped junk and is deliberately unmapped. This is not a gap the Inbound team can fill."
      >
        n/a
      </span>
    );
  }
  return lead.expectedClosure
    ? <span className="text-gray-600">{fmtDay(lead.expectedClosure)}</span>
    : <span className="text-gray-300" title="No expected closure date entered">—</span>;
}

// ── Detail view ──────────────────────────────────────────────────────────────

function DetailDrawer({ lead, onClose, onSaved }: {
  lead: UnifiedLead;
  onClose: () => void;
  onSaved: (updated: UnifiedLead) => void;
}) {
  const inbound = lead.inbound;
  const outreach = lead.outreach;

  // "Assisted at EC" is the one thing this tab owns. Held locally and written
  // back to whichever source row the lead came from.
  const [ecName, setEcName] = useState<string | undefined>(
    outreach?.ecName ?? inbound?.placedUnder?.ecName,
  );
  const [ecBmName, setEcBmName] = useState<string | undefined>(
    outreach?.ecBmName ?? inbound?.placedUnder?.ecBmName,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // ── Enquiry ID and its deal ticket (§ "Enquiry ID and Details" + "Products") ──
  const [enq, setEnq] = useState<EnqLookup | null>(null);
  const [enqLoading, setEnqLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!lead.enqId || !lead.phone) { setEnq(null); return; }
    setEnqLoading(true);
    lookupEnqId(lead.phone, lead.enqId)
      .then((r) => { if (alive) setEnq(r); })
      .finally(() => { if (alive) setEnqLoading(false); });
    return () => { alive = false; };
  }, [lead.enqId, lead.phone]);

  const saveEc = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    let err: string | null;
    if (outreach) {
      const updated: OutreachLead = { ...outreach, ecName, ecBmName };
      err = await upsertOutreachLead(updated);
      if (!err) onSaved({ ...lead, outreach: updated });
    } else if (inbound) {
      const updated: InboundLead = {
        ...inbound,
        placedUnder: { ...(inbound.placedUnder || {}), ecName, ecBmName },
      };
      err = await upsertInboundLead(updated);
      if (!err) onSaved({ ...lead, inbound: updated });
    } else {
      err = 'This lead has no source record to write to.';
    }
    setSaving(false);
    if (err) setSaveError(`Could not save: ${err}. Nothing was stored.`);
    else { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  };

  const products = enq?.status === 'matched'
    ? String(enq.deal?.cartItems || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <div className="fixed inset-0 z-[1200] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[780px] bg-[#F7F7F8] h-full overflow-y-auto shadow-2xl flex flex-col">

        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold text-gray-900 truncate">
                {lead.companyName || <LeadName lead={{ company: inbound?.company, phone: lead.phone }} />}
              </h2>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {lead.phone && <span className="text-[12px] font-mono text-gray-500">{lead.phone}</span>}
                <span className="text-gray-300">·</span>
                <SourceChip s={lead.source} />
                <UnifiedStatusCell lead={lead} />
                {inbound && <StatusBadge s={inbound.stage} />}
                {outreach && <OutreachStatusBadge s={outreach.status} />}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none shrink-0">×</button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* ── Client details ── */}
          <SectionCard title="Client details" subtitle="From the originating form">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Company"><ReadValue v={lead.companyName} /></Field>
              <Field label="Contact person"><ReadValue v={lead.contactPerson} /></Field>
              <Field label="Contact number"><ReadValue v={lead.phone} /></Field>
              <Field label="GST"><ReadValue v={lead.gstNumber} /></Field>
              <Field label="Segment"><ReadValue v={inbound?.segment ?? outreach?.segment} /></Field>
              <Field label={outreach ? 'Company type' : 'Client type'}>
                <ReadValue v={outreach ? companyTypeLabel(outreach.companyType, outreach.companyTypeOther) : inbound?.clientType} />
              </Field>
              {outreach?.designation && <Field label="Designation"><ReadValue v={outreach.designation} /></Field>}
              <Field label="Lead type"><ReadValue v={inbound?.leadType ?? outreach?.leadType} /></Field>
            </div>
          </SectionCard>

          {/* ── Source details ── */}
          <SectionCard title="Source details">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Source"><ReadValue v={lead.source} /></Field>
              <Field label="Spok" hint="Whoever is/was speaking to the lead"><ReadValue v={lead.spok} /></Field>
              <Field label="Source status"><ReadValue v={lead.sourceStatus} /></Field>
              <Field label={outreach ? 'BM' : 'Assigned BM'}><ReadValue v={outreach?.bm ?? inbound?.owner} /></Field>
              <Field label="KAM"><ReadValue v={lead.kam} /></Field>
              <Field label="Created">
                <ReadValue v={fmtLeadDateTime(outreach?.createdAt ?? inbound?.leadCreatedAt)} />
              </Field>
            </div>
          </SectionCard>

          {/* ── Source lead details ── */}
          {inbound && (
            <SectionCard title="Inbound lead details" owner="kylas" subtitle="Presales capture, call log and priority">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="Qualified as"><ReadValue v={inbound.qualificationTag} /></Field>
                <Field label="Qualified by"><ReadValue v={inbound.presalesOwner} /></Field>
                <Field label="Urgency"><ReadValue v={inbound.urgency} /></Field>
                <Field label="Pincode"><ReadValue v={inbound.pincode} /></Field>
                <Field label="Location"><ReadValue v={inbound.location} /></Field>
                <Field label="Priority"><ReadValue v={inbound.priority} /></Field>
                <Field label="Lead summary" className="col-span-2 sm:col-span-3"><ReadValue v={inbound.leadSummary} /></Field>
                <Field label="Selection" className="col-span-2"><ReadValue v={(inbound.selections || []).join(' / ')} /></Field>
                <Field label="Next follow-up"><ReadValue v={inbound.followUpDate ? fmtDay(inbound.followUpDate) : ''} /></Field>
                <Field label="Requirement" className="col-span-2 sm:col-span-3"><ReadValue v={inbound.requirement} /></Field>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Call log · {inbound.callAttempts?.length || 0} of 4
                </span>
                {(inbound.callAttempts || []).length === 0 ? <Empty>No call attempts logged.</Empty> : (
                  <div className="flex flex-col gap-1.5">
                    {(inbound.callAttempts || []).map((a) => (
                      <div key={a.n} className="text-[11.5px] flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-700">Attempt {a.n}</span>
                        <Pill color={a.outcome === 'Connected' ? '#22C55E' : '#EF4444'}>{a.outcome}</Pill>
                        <span className="text-gray-400">{fmtLeadDateTime(a.at)}</span>
                        {a.note && <span className="text-gray-500 truncate">{a.note}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {outreach && (
            <SectionCard title="Outreach lead details" owner="crm" subtitle="Meetings and meeting notes">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="Selection" className="col-span-2"><ReadValue v={(outreach.selections || []).join(' / ')} /></Field>
                <Field label="Expected order value" hint="The BM's estimate">
                  <ReadValue v={outreach.expectedOrderValue ? fmtINR(outreach.expectedOrderValue) : ''} />
                </Field>
                <Field label="Requirement" className="col-span-2 sm:col-span-3"><ReadValue v={outreach.requirement} /></Field>
                <Field label="Next follow-up"><ReadValue v={outreach.followUpDate ? fmtDay(outreach.followUpDate) : ''} /></Field>
                <Field label="Lost reason"><ReadValue v={outreach.lostReason} /></Field>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Meetings · {outreach.meetings?.length || 0} of 4
                </span>
                {(outreach.meetings || []).length === 0 ? <Empty>No meetings scheduled.</Empty> : (
                  <div className="flex flex-col gap-2">
                    {(outreach.meetings || []).map((m) => (
                      <div key={m.n} className="border border-gray-100 rounded-md p-2">
                        <MeetingLine m={m} />
                        {m.notes && <div className="text-[11.5px] text-gray-600 mt-1.5 whitespace-pre-wrap">{m.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* ── Enquiry ID and details ── */}
          <SectionCard title="Enquiry ID and details" owner="deals" subtitle="From Procurement's deal ticket">
            {!lead.enqId ? (
              <p className="text-[11.5px] text-gray-500 leading-snug">
                No Enquiry ID on this lead yet. One is raised when the lead reaches <strong>PI Shared</strong> —
                until then Procurement holds nothing against it, so there is no order value or line items
                to show.
              </p>
            ) : enqLoading ? <Spinner label="Loading the deal ticket…" />
              : enq?.status === 'matched' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Enquiry ID"><ReadValue v={lead.enqId} /></Field>
                  <Field label="Order value"><ReadValue v={fmtINR(enq.orderValue || 0)} /></Field>
                  <Field label="Deal status"><ReadValue v={enq.dealStatus} /></Field>
                  <Field label="Assigned to"><ReadValue v={enq.bmName} /></Field>
                  <Field label="Branch"><ReadValue v={enq.branch} /></Field>
                  <Field label="Created"><ReadValue v={enq.deal?.createdAt ? fmtDay(enq.deal.createdAt) : ''} /></Field>
                  <Field label="Follow-up"><ReadValue v={enq.deal?.followUpDate ? fmtDay(enq.deal.followUpDate) : ''} /></Field>
                  <Field label="Closure"><ReadValue v={enq.deal?.closureDate ? fmtDay(enq.deal.closureDate) : ''} /></Field>
                  <Field label="Lost reason"><ReadValue v={enq.deal?.lostReason} /></Field>
                </div>
              ) : enq?.status === 'no-match' ? (
                <div className="text-[11.5px] text-amber-800 leading-snug">
                  <strong className="font-mono">{lead.enqId}</strong> does not match any deal ticket on
                  {lead.phone ? <span className="font-mono"> {lead.phone} </span> : ' this lead '}
                  exactly, so nothing was fetched. Matching is exact on purpose — resolving a near-miss would attach another
                  client&apos;s money to this lead.
                  {enq.available?.length ? <> Tickets on this number: <span className="font-mono">{enq.available.join(', ')}</span>.</> : null}
                </div>
              ) : (
                <div className="text-[11.5px] text-red-700 leading-snug">
                  The deal system did not answer, so this block is <strong>unreadable, not empty</strong>.
                  Do not read it as &ldquo;no enquiry exists&rdquo;.
                </div>
              )}
          </SectionCard>

          {/* ── Products under Enquiry ID ── */}
          <SectionCard title="Products under Enquiry ID" owner="deals" subtitle="Line items on that cart">
            {!lead.enqId ? <Empty>No Enquiry ID yet.</Empty>
              : enqLoading ? <Spinner label="Loading line items…" />
                : enq?.status !== 'matched' ? (
                  <Empty>
                    {enq?.status === 'unavailable'
                      ? 'Could not reach the deal system — line items are unreadable, not absent.'
                      : 'No matching deal ticket, so no line items.'}
                  </Empty>
                ) : products.length === 0 ? (
                  <Empty>The matched ticket lists no products.</Empty>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {products.map((p, i) => (
                      <li key={i} className="text-[12px] text-gray-700 border border-gray-100 rounded-md px-3 py-1.5">{p}</li>
                    ))}
                  </ul>
                )}
          </SectionCard>

          {/* ── Assisted at EC — the one thing this tab owns ── */}
          <SectionCard
            title="Assisted at EC"
            owner="crm"
            subtitle="Experience Centre that helped close this lead"
            right={saved ? <span className="text-[10px] font-semibold text-[#0F766E]">Saved</span> : null}
          >
            <EcPicker
              ecName={ecName}
              ecBmName={ecBmName}
              onChange={(patch) => { setEcName(patch.ecName); setEcBmName(patch.ecBmName); }}
              disabled={saving}
            />
            {saveError && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{saveError}</div>
            )}
            <div className="flex items-center justify-end mt-3">
              <button
                onClick={saveEc}
                disabled={saving}
                className="px-4 py-2 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-2 leading-snug">
              Written back to the {lead.source} record this lead came from — this tab has no store of its own.
            </p>
          </SectionCard>

          {/* ── Comments and notes ── */}
          <SectionCard title="Comments and notes" owner="crm" subtitle="Read-only here — add them in the source module">
            {(() => {
              const notes = outreach?.notes ?? inbound?.notes ?? [];
              if (!notes.length) return <Empty>No notes on this lead.</Empty>;
              return (
                <div className="flex flex-col gap-2">
                  {notes.slice().reverse().map((n, i) => (
                    <div key={i} className="text-[11.5px] border border-gray-100 rounded-md p-2">
                      <div className="text-gray-700 whitespace-pre-wrap">{n.text}</div>
                      <div className="text-gray-400 mt-1">{n.author} · {n.ts}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </SectionCard>
        </div>

        <div className="mt-auto sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
          <span className="text-[11px] text-gray-400">
            Open this lead in <strong>{lead.source}</strong> to change anything but the EC fields.
          </span>
          <button onClick={onClose} className="px-4 py-2 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function LeadsTab() {
  const [leads, setLeads] = useState<UnifiedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<LeadSource[]>([]);
  const [inboundTotal, setInboundTotal] = useState(0);
  const [inboundHasMore, setInboundHasMore] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [source, setSource] = useState<'all' | LeadSource>('all');
  const [status, setStatus] = useState<'all' | UnifiedStatus>('all');
  const [lostOnly, setLostOnly] = useState(false);
  const [hideLost, setHideLost] = useState(false);
  const [kam, setKam] = useState('all');
  const [search, setSearch] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [page, setPage] = useState(0);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchUnifiedLeads({ createdFrom, createdTo })
      .then((res) => {
        setLeads(res.leads);
        setFailed(res.failed);
        setInboundTotal(res.inboundTotal);
        setInboundHasMore(res.inboundHasMore);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load leads'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [createdFrom, createdTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (source !== 'all' && l.source !== source) return false;
      if (status !== 'all' && l.status !== status) return false;
      if (lostOnly && !l.lost) return false;
      if (hideLost && l.lost) return false;
      if (kam !== 'all' && l.kam !== kam) return false;
      if (q) {
        const hay = [l.companyName, l.contactPerson, l.phone, l.enqId, l.spok, l.kam]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, source, status, lostOnly, hideLost, kam, search]);

  useEffect(() => { setPage(0); }, [filtered.length]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const counts = useMemo(() => ({
    total: filtered.length,
    closed: filtered.filter((l) => l.status === 'Closed').length,
    lost: filtered.filter((l) => l.lost).length,
    withEnq: filtered.filter((l) => !!l.enqId).length,
    value: filtered.reduce((a, l) => a + (Number(l.orderValue) || 0), 0),
  }), [filtered]);

  const handleExport = async (format: ExportFormat, scope: ExportScope) => {
    if (exporting) return;
    const list = scope === 'all' ? leads : filtered;
    if (!list.length) { setError('No leads matched — nothing to export.'); return; }
    setExporting(true);
    try {
      const name = `b2b_leads_${scope}_${todayStr()}`;
      const data = list.map(toExportRow);
      if (format === 'csv') exportRowsCsv(EXPORT_HEADERS, data, name);
      else await exportRowsExcel(EXPORT_HEADERS, data, name, 'Leads');
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setSource('all'); setStatus('all'); setLostOnly(false); setHideLost(false);
    setKam('all'); setSearch(''); setCreatedFrom(''); setCreatedTo('');
  };
  const activeFilters = [
    source !== 'all', status !== 'all', lostOnly, hideLost, kam !== 'all',
    !!search.trim(), !!createdFrom, !!createdTo,
  ].filter(Boolean).length;

  const selected = leads.find((l) => l.key === selectedKey) || null;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-[19px] font-bold text-gray-900">Leads</h1>
          <p className="text-[11.5px] text-gray-500 mt-0.5">
            Every lead across Inbound and Outreach
            {loading ? ' · loading…' : ` · ${filtered.length} shown`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton onExport={handleExport} disabled={exporting} />
          <button
            onClick={load}
            disabled={loading}
            className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap disabled:opacity-50"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* A half-loaded list must never look like a complete one. */}
      {failed.length > 0 && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 leading-snug">
          The <strong>{failed.join(' and ')}</strong> {failed.length === 1 ? 'side' : 'sides'} did not load, so this
          list is incomplete — it is not a CRM with no {failed.join('/')} leads. Refresh to try again.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 flex items-start justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700 text-lg leading-none shrink-0">×</button>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 mb-4">
        <div className="flex items-end gap-2.5 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Company, contact, phone, Enquiry ID, KAM…"
              className={inputCls}
            />
          </div>
          {([
            ['Source', 'Both sources', source, setSource, ['all', 'Inbound', 'Outreach']],
            ['Status', 'All statuses', status, setStatus, ['all', 'Closed', 'Yet to Close']],
            ['KAM', 'All KAMs', kam, setKam, ['all', ...KAMS]],
          ] as const).map(([label, allLabel, val, setter, opts]) => (
            <div key={label}>
              <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</label>
              <select
                value={val as string}
                onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[130px]"
              >
                {opts.map((o) => <option key={o} value={o}>{o === 'all' ? allLabel : o}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Created from</label>
            <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)}
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white" />
          </div>
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">to</label>
            <input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)}
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white" />
          </div>
          <button
            onClick={() => { setLostOnly((v) => !v); setHideLost(false); }}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border whitespace-nowrap ${
              lostOnly ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-500 border-gray-200 hover:border-red-400'
            }`}
          >
            Lost only
          </button>
          <button
            onClick={() => { setHideLost((v) => !v); setLostOnly(false); }}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border whitespace-nowrap ${
              hideLost ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            }`}
          >
            Hide lost
          </button>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="px-3 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white text-gray-500 whitespace-nowrap">
              Clear {activeFilters}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 py-16"><Spinner label="Loading leads from both modules…" /></div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-baseline gap-3 px-4 py-2.5 border-b border-gray-100 flex-wrap">
            <span className="text-[11.5px] text-gray-600"><strong>{counts.total}</strong> leads</span>
            <span className="text-[11.5px] text-gray-500">{counts.closed} closed</span>
            <span className="text-[11.5px] text-gray-500">{counts.lost} lost</span>
            <span className="text-[11.5px] text-gray-500">{counts.withEnq} with an Enquiry ID</span>
            <span className="text-[11.5px] text-gray-700 font-mono">{fmtINR(counts.value)} order value</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {['Company Name', 'GST', 'Contact Number', 'Enquiry ID', 'Order Value',
                    'Expected Closure', 'KAM', 'Source', 'Spok', 'Status'].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.key} onClick={() => setSelectedKey(l.key)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                    <td className="px-3 py-2 font-semibold text-gray-900 max-w-[220px] truncate">
                      {l.companyName || <LeadName lead={{ company: l.inbound?.company, phone: l.phone }} />}
                    </td>
                    <td className="px-3 py-2 text-gray-500 font-mono whitespace-nowrap">{l.gstNumber || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-gray-500 font-mono whitespace-nowrap">{l.phone || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-gray-600 font-mono whitespace-nowrap">{l.enqId || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">
                      {l.orderValue ? fmtINR(l.orderValue) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap"><ExpectedClosureCell lead={l} /></td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.kam || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2"><SourceChip s={l.source} /></td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.spok || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2"><UnifiedStatusCell lead={l} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <Empty>No leads match these filters.</Empty>}
          <div className="flex items-center justify-between px-3 py-3 border-t border-gray-100 gap-3 flex-wrap">
            <span className="text-[11px] text-gray-400">
              Page {page + 1} of {pages} · {filtered.length} shown
              {inboundHasMore && inboundTotal > 0 && (
                <span> · {inboundTotal} unactioned inbound leads sit in Kylas; open the Inbound tab to page through them.</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">← Prev</button>
              <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}
                className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">Next →</button>
            </div>
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-400 mt-3 leading-snug">
        Status is the PRD&apos;s binary Closed / Yet to Close. Lost leads stay listed, marked Lost — filter
        them in or out above. <strong>Expected Closure</strong> reads <em>n/a</em> for Inbound leads because
        the Inbound module has no such field, which is different from a date nobody entered.
      </p>

      {selected && (
        <DetailDrawer
          lead={selected}
          onClose={() => setSelectedKey(null)}
          onSaved={(updated) => setLeads((prev) => prev.map((l) => (l.key === updated.key ? updated : l)))}
        />
      )}
    </div>
  );
}
