'use client';

import EcPicker from '../../ui/ec-picker';

import { InboundLead, OutreachLead, fmtINR } from '../../models/mock-data';
import { companyTypeLabel } from '../../models/outreach';
import { Empty, Field, LeadName, Pill, ReadValue, SectionCard, Spinner, StatusBadge, fmtDay, fmtLeadDateTime } from '../../ui/inbound-chips';
import { MeetingLine, OutreachStatusBadge } from '../../ui/outreach-chips';
import { SourceChip, UnifiedStatusCell } from './cells';
import { EnqLookup, UnifiedLead, lookupEnqId, upsertInboundLead, upsertOutreachLead } from '@/lib/b2b';
import { useEffect, useState } from 'react';

export function DetailDrawer({ lead, onClose, onSaved }: {
  lead: UnifiedLead;
  onClose: () => void;
  onSaved: (updated: UnifiedLead) => void;
}) {
  const inbound = lead.inbound;
  const outreach = lead.outreach;

  const [ecName, setEcName] = useState<string | undefined>(
    outreach?.ecName ?? inbound?.placedUnder?.ecName,
  );
  const [ecBmName, setEcBmName] = useState<string | undefined>(
    outreach?.ecBmName ?? inbound?.placedUnder?.ecBmName,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
