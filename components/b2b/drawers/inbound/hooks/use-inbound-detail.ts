'use client';

import { CallLogEntry, InboundLead, LeadDeal, LeadNote, OutreachLead } from '../../../models/mock-data';
import { fetchCallLogSummary, fetchInboundLeadDetail, fetchLeadCallLogs, fetchLeadDeals, fetchLeadNotes } from '@/lib/api';
import { fetchOutreachLeads } from '@/lib/b2b';
import { isCrmAddedLead } from '../../../models/inbound';
import { normalisePhone } from '@/lib/org/utils';
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react';

export interface Loaded<T> { loading: boolean; data: T; failed?: boolean }

export function useInboundDetail(lead: InboundLead, setDraft: Dispatch<SetStateAction<InboundLead>>) {
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailFailed, setDetailFailed] = useState(false);
  const [presalesNotes, setPresalesNotes] = useState<Loaded<LeadNote[]>>({ loading: true, data: [] });
  const [presalesCalls, setPresalesCalls] = useState<Loaded<CallLogEntry[]>>({ loading: true, data: [] });
  const [deals, setDeals] = useState<Loaded<LeadDeal[]>>({ loading: true, data: [] });
  const [outreach, setOutreach] = useState<Loaded<OutreachLead | null>>({ loading: true, data: null });

  useEffect(() => {
    let alive = true;
    setDetailFailed(false);
    if (isCrmAddedLead(lead)) { setDetailLoading(false); return; }
    setDetailLoading(true);
    fetchInboundLeadDetail(lead.id)
      .then((d) => {
        if (!alive) return;
        if (!d.loaded) { setDetailFailed(true); return; }
        setDraft((prev) => ({
          ...prev,
          leadSummary: d.leadSummary ?? prev.leadSummary,
          urgency: d.urgency ?? prev.urgency,
          pincode: d.pincode ?? prev.pincode,
          presalesOwner: d.presalesOwner ?? prev.presalesOwner,
          presalesClientType: d.presalesClientType ?? prev.presalesClientType,
          presalesMissedCalls: d.presalesMissedCalls ?? prev.presalesMissedCalls,
          qualificationTag: d.qualificationTag ?? prev.qualificationTag,
          leadCreatedAt: d.leadCreatedAt ?? prev.leadCreatedAt,
          phone: d.phone || prev.phone,
          contactName: d.contactName ?? prev.contactName,
          company: d.kylasName || prev.company,
          requirement: prev.requirement || d.requirement,
          selections: prev.selections?.length ? prev.selections : d.selections,
        }));
      })
      .finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [lead.id, setDraft]);

  useEffect(() => {
    let alive = true;
    if (isCrmAddedLead(lead)) {
      setPresalesNotes({ loading: false, data: [] });
      setPresalesCalls({ loading: false, data: [] });
      return;
    }
    setPresalesNotes({ loading: true, data: [] });
    setPresalesCalls({ loading: true, data: [] });
    fetchLeadNotes(lead.id, lead.ownerId).then((n) => { if (alive) setPresalesNotes({ loading: false, data: n }); });
    fetchLeadCallLogs(lead.id).then((c) => { if (alive) setPresalesCalls({ loading: false, data: c }); });
    return () => { alive = false; };
  }, [lead.id, lead.ownerId]);

  const phoneKey = useMemo(
    () => [...new Set([lead.phone, lead.primaryContactPhone].map((p) => normalisePhone(p)).filter((p) => p.length === 10))].join(','),
    [lead.phone, lead.primaryContactPhone],
  );

  useEffect(() => {
    let alive = true;
    setDeals({ loading: true, data: [] });
    const phones = phoneKey ? phoneKey.split(',') : [];
    Promise.all(phones.map((p) => fetchLeadDeals(p))).then((lists) => {
      if (!alive) return;
      const seen = new Set<string>();
      const merged = lists.flat().filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
      merged.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      setDeals({ loading: false, data: merged });
    });
    return () => { alive = false; };
  }, [phoneKey]);

  useEffect(() => {
    let alive = true;
    fetchOutreachLeads()
      .then((rows) => {
        if (!alive) return;
        setOutreach({ loading: false, data: rows.find((o) => o.intake?.inboundLeadId === lead.id) ?? null });
      })
      .catch(() => { if (alive) setOutreach({ loading: false, data: null, failed: true }); });
    return () => { alive = false; };
  }, [lead.id]);

  return { detailLoading, detailFailed, presalesNotes, presalesCalls, deals, outreach, fetchCallLogSummary };
}
