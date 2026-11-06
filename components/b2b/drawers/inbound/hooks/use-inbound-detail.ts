'use client';

import { CallLogEntry, InboundLead, LeadDeal, LeadNote, OutreachLead } from '../../../models/mock-data';
import { fetchCallLogSummary, fetchFirmDeals, fetchInboundLeadDetail, fetchLeadCallLogs, fetchLeadNotes } from '@/lib/api';
import { fetchOutreachLeads, inboundPhones } from '@/lib/b2b';
import { isCrmAddedLead } from '../../../models/inbound';
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
          leadSummary: prev.leadSummary ?? d.leadSummary,
          urgency: prev.urgency ?? d.urgency,
          pincode: prev.pincode ?? d.pincode,
          presalesOwner: prev.presalesOwner ?? d.presalesOwner,
          presalesClientType: prev.presalesClientType ?? d.presalesClientType,
          presalesMissedCalls: prev.presalesMissedCalls ?? d.presalesMissedCalls,
          qualificationTag: prev.qualificationTag ?? d.qualificationTag,
          leadCreatedAt: prev.leadCreatedAt ?? d.leadCreatedAt,
          phone: prev.phone || d.phone || '',
          contactName: prev.contactName || d.contactName || '',
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
    () => inboundPhones(lead).join(','),
    [lead.phone, lead.primaryContactPhone, lead.additionalContacts],
  );

  useEffect(() => {
    let alive = true;
    setDeals({ loading: true, data: [] });
    fetchFirmDeals(phoneKey ? phoneKey.split(',') : []).then((merged) => {
      if (alive) setDeals({ loading: false, data: merged });
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
