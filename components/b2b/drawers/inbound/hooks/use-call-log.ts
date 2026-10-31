'use client';

import { CallAttempt, InboundStatus, connectedCallErrors, istToday, nextAttemptNumber, nextWorkingDay } from '../../../models/inbound';
import { InboundLead, LeadNote } from '../../../models/mock-data';
import { upsertInboundLead } from '@/lib/b2b';
import { useState } from 'react';

export interface ConnectedForm { durationMin: string; followUpDate: string; note: string }

const EMPTY_FORM: ConnectedForm = { durationMin: '', followUpDate: '', note: '' };

export function useCallLog(
  draft: InboundLead,
  actorName: string,
  actorPhone: string,
  prepare: (next: InboundLead) => InboundLead,
  commit: (next: InboundLead) => void,
) {
  const [form, setForm] = useState<ConnectedForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const today = istToday();
  const by = actorName || 'Unknown';
  const byPhone = actorPhone || undefined;

  const persist = async (draftNext: InboundLead, failMsg: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const next = prepare(draftNext);
    const err = await upsertInboundLead(next);
    setBusy(false);
    if (err) { setError(`${failMsg}: ${err}`); return false; }
    commit(next);
    return true;
  };

  const withAttempt = (attempt: CallAttempt, stage: InboundStatus, followUpDate: string): InboundLead => ({
    ...draft,
    callAttempts: [...(draft.callAttempts || []), attempt],
    followUpDate,
    stage,
    statusChangedAt: stage !== draft.stage ? attempt.at : draft.statusChangedAt,
  });

  const logRnr = async () => {
    if (busy) return;
    const at = new Date().toISOString();
    const followUpDate = nextWorkingDay(today);
    const attempt: CallAttempt = { n: nextAttemptNumber(draft.callAttempts), outcome: 'RNR', at, by, byPhone, followUpDate };
    await persist(withAttempt(attempt, draft.stage, followUpDate), 'Could not save the RNR');
  };

  const formErrors = form ? connectedCallErrors(form, today) : [];

  const logConnected = async () => {
    if (busy || !form) return;
    if (formErrors.length) { setError(formErrors[0]); return; }
    const at = new Date().toISOString();
    const attempt: CallAttempt = {
      n: nextAttemptNumber(draft.callAttempts), outcome: 'Connected', at, by, byPhone,
      note: form.note.trim(), durationMin: Number(form.durationMin), followUpDate: form.followUpDate,
    };
    const stage: InboundStatus = draft.stage === 'New' ? 'Connected - Need nurturing' : draft.stage;
    if (await persist(withAttempt(attempt, stage, form.followUpDate), 'Could not save the call')) {
      setForm(null);
    }
  };

  const addNote = async () => {
    const text = noteText.trim();
    if (!text || busy) return;
    const note: LeadNote = { ts: new Date().toISOString(), author: by, text };
    if (await persist({ ...draft, notes: [...(draft.notes || []), note] }, 'Could not save the note')) setNoteText('');
  };

  return {
    busy, error, setError, today,
    form, formErrors, openForm: () => { setForm(EMPTY_FORM); setError(null); }, closeForm: () => { setForm(null); setError(null); },
    patchForm: (p: Partial<ConnectedForm>) => setForm((f) => (f ? { ...f, ...p } : f)),
    logRnr, logConnected, noteText, setNoteText, addNote,
  };
}
