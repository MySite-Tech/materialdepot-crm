'use client';

import { OrderSearchDeal, OrderSearchRaise, getRaiseEscalationStatus, raiseEscalationDirect, retryRaiseEscalation } from '../../../lib/api/ops/escalation';
import { Deal } from '@/lib/types';
import { RAISE_OPTIONS, RAISE_POLL_INTERVAL_MS, RAISE_POLL_MAX_ATTEMPTS } from './constants';
import { EscSupportDeal, RaiseOption, RaiseProgress } from './types';
import { Dispatch, RefObject, SetStateAction } from 'react';

const optionKey = (name: string) => name.replace(/\s+/g, "").toLowerCase();

export function toRaiseProgress(raise: OrderSearchRaise): RaiseProgress {
  const options: RaiseOption[] = (raise.reason ?? []).map((name) => {
    const known = RAISE_OPTIONS.find((o) => optionKey(o.name) === optionKey(name));
    return known ? { id: known.id, name: known.name, requestType: known.requestType } : { id: 0, name };
  });
  return {
    leadId: raise.lead_id,
    requestId: raise.request_id,
    options,
    status: raise.status,
    steps: raise.steps ?? { deal: "done", ticket: raise.status === "success" ? "done" : "running" },
    error: raise.error,
  };
}

export function makeRaiseActions({ escSupportDeals, pollingRef, setDeals, setRaises, setEscSupportDeals, setSelectedDeal, setSubmitError, setSubmitSuccess, setSubmitting, submitLockRef }: {
  escSupportDeals: EscSupportDeal[];
  pollingRef: RefObject<Set<number>>;
  setDeals: Dispatch<SetStateAction<OrderSearchDeal[]>>;
  setRaises: Dispatch<SetStateAction<RaiseProgress[]>>;
  setEscSupportDeals: Dispatch<SetStateAction<EscSupportDeal[]>>;
  setSelectedDeal: Dispatch<SetStateAction<OrderSearchDeal | null>>;
  setSubmitError: Dispatch<SetStateAction<string | null>>;
  setSubmitSuccess: Dispatch<SetStateAction<string | null>>;
  setSubmitting: Dispatch<SetStateAction<string | null>>;
  submitLockRef: RefObject<boolean>;
}) {
function getOngoing(dealName: string) {
  const base = dealName.match(/((?:ENQ|MD|CT)\w+)/i)?.[1]?.toUpperCase();
  if (!base) return [];
  const onOrder = escSupportDeals.filter((d) => d.name.toUpperCase().includes(base));
  const lastClosed = onOrder
    .filter((d) => d.closed)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
  return [...onOrder.filter((d) => !d.closed), ...(lastClosed ? [lastClosed] : [])];
}

function findSameIssue(dealName: string, reasonId: number): EscSupportDeal | undefined {
  return getOngoing(dealName).find((d) => d.reasonIds.includes(reasonId));
}

async function addNoteToTicket(ticketId: number, text: string, author?: string) {
  const res = await fetch("/api/notes/relation/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceEntity: { description: `<div><b>[${author ?? "Unknown"}]</b> ${text.trim()}</div>` },
      targetEntityId: String(ticketId),
      targetEntityType: "DEAL",
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? `Failed: ${res.status}`);
  }
}

function upsertRaise(next: RaiseProgress, replaceId?: number) {
  setRaises((prev) => {
    const matchId = replaceId ?? next.requestId;
    const found = prev.some((r) => r.requestId === matchId);
    return found ? prev.map((r) => (r.requestId === matchId ? next : r)) : [next, ...prev];
  });
}

function markRaised(deal: OrderSearchDeal, progress: RaiseProgress, salesDealId: number | null, ticketId: string | null) {
  const field = "cfRaiseEscalation";
  const chosen = progress.options.map((o) => ({ id: o.id, name: o.name }));
  const mergeCf = (d: Pick<Deal, 'customFieldValues'>) => {
    const prev = (d.customFieldValues ?? {})[field];
    const prevArr = Array.isArray(prev) ? (prev as { id: number; name: string }[]) : [];
    return [...prevArr.filter((e) => !chosen.some((c) => c.id === e.id)), ...chosen];
  };
  setDeals((prev) => prev.map((d) => d.leadId === deal.leadId
    ? { ...d, id: salesDealId ?? d.id, customFieldValues: { ...(d.customFieldValues ?? {}), [field]: mergeCf(d) } }
    : d
  ));
  setSelectedDeal((prev) => prev && prev.leadId === deal.leadId
    ? { ...prev, id: salesDealId ?? prev.id, customFieldValues: { ...(prev.customFieldValues ?? {}), [field]: mergeCf(prev) } }
    : prev
  );
  if (ticketId) {
    const isSupport = progress.options.every((o) => o.requestType === "Support");
    setEscSupportDeals((prev) => prev.some((t) => String(t.id) === ticketId) ? prev : [{
      id: Number(ticketId),
      name: `${deal.leadId} · ${progress.options.map((o) => o.name).join(", ")}`,
      stage: "New Ticket",
      pipeline: isSupport ? "support" : "escalation",
      rca: "",
      resolution: "",
      closed: false,
      updatedAt: new Date().toISOString(),
      reasonIds: progress.options.map((o) => o.id),
    }, ...prev]);
  }
}

async function pollRaise(deal: OrderSearchDeal, start: RaiseProgress) {
  if (pollingRef.current.has(start.requestId)) return;
  pollingRef.current.add(start.requestId);
  try {
    await pollRaiseUntilDone(deal, start);
  } finally {
    pollingRef.current.delete(start.requestId);
  }
}

function resumeRaises(deals: OrderSearchDeal[], raises: RaiseProgress[]) {
  for (const raise of raises) {
    if (raise.status !== "pending" && raise.status !== "retrying") continue;
    const deal = deals.find((d) => d.leadId === raise.leadId);
    if (deal) void pollRaise(deal, raise);
  }
}

async function pollRaiseUntilDone(deal: OrderSearchDeal, start: RaiseProgress) {
  let last = start;
  for (let attempt = 0; attempt < RAISE_POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, RAISE_POLL_INTERVAL_MS));
    let status;
    try {
      status = await getRaiseEscalationStatus(last.requestId);
    } catch {
      continue;
    }
    last = { ...last, status: status.status, steps: status.steps ?? last.steps, error: status.error };
    upsertRaise(last);
    if (status.status === "failed") return;
    if (status.status === "success") {
      markRaised(deal, last, Number(status.deal_id) || null, status.escalation_deal_id);
      return;
    }
  }
  upsertRaise({ ...last, status: "slow" });
}

async function handleSubmit(deal: OrderSearchDeal, options: RaiseOption[], notes?: string) {
  if (submitLockRef.current) return;
  submitLockRef.current = true;
  setSubmitting(deal.leadId);
  setSubmitError(null);
  setSubmitSuccess(null);

  const placeholderId = -Date.now();
  const placeholder: RaiseProgress = {
    leadId: deal.leadId,
    requestId: placeholderId,
    options,
    status: "pending",
    steps: { deal: deal.id ? "done" : "running", ticket: deal.id ? "running" : "pending" },
    error: null,
  };
  upsertRaise(placeholder);

  let accepted: RaiseProgress | null = null;
  try {
    const requestType = options.some((o) => o.requestType === "Escalation") ? "Escalation" : "Support";
    const { request_id } = await raiseEscalationDirect(
      deal.id,
      options.map((o) => String(o.id)),
      requestType,
      notes?.trim(),
      deal.leadId,
    );
    accepted = { ...placeholder, requestId: request_id };
    setRaises((prev) => {
      const withoutPlaceholder = prev.filter((r) => r.requestId !== placeholderId);
      return withoutPlaceholder.some((r) => r.requestId === request_id)
        ? withoutPlaceholder
        : [accepted as RaiseProgress, ...withoutPlaceholder];
    });
    setSubmitSuccess(deal.leadId);
    setTimeout(() => setSubmitSuccess(null), 1500);
  } catch (err) {
    setRaises((prev) => prev.filter((r) => r.requestId !== placeholderId));
    setSubmitError(err instanceof Error ? err.message : "Could not submit the request. Please try again.");
  } finally {
    submitLockRef.current = false;
    setSubmitting(null);
  }

  if (accepted) await pollRaise(deal, accepted);
}

async function retryRaise(deal: OrderSearchDeal, progress: RaiseProgress) {
  const restarting: RaiseProgress = {
    ...progress,
    status: "pending",
    error: null,
    steps: progress.steps.deal === "failed"
      ? { deal: "running", ticket: "pending" }
      : { deal: "done", ticket: "running" },
  };
  upsertRaise(restarting);
  try {
    await retryRaiseEscalation(progress.requestId);
  } catch (err) {
    upsertRaise({ ...progress, error: err instanceof Error ? err.message : "Retry failed" });
    return;
  }
  await pollRaise(deal, restarting);
}

  return { addNoteToTicket, findSameIssue, getOngoing, handleSubmit, resumeRaises, retryRaise };
}
