'use client';

import { KylasDealInfo, SyncEstimateResult, fetchKylasDealInfo, syncEstimate } from '../../../lib/api/ops/kylas-sync';
import { Deal, DealsSearchResponse } from '../../../lib/types/index';
import { DEFAULT_PAGE_SIZE, RAISE_OPTIONS, SALES_PIPELINE_RULE, SEARCH_FIELDS } from './constants';
import { AssociatedDeal, ContactResult } from './types';
import { formatCurrency, friendlyPatchError, isSalesDeal } from './utils';
import { Dispatch, RefObject, SetStateAction } from 'react';

export function makeRaiseActions({ defaultRange, escSupportDeals, kylasInput, pageLoading, setContactDeals, setContacts, setCurrentPage, setDealContact, setDeals, setKylasDealInfo, setKylasError, setKylasInput, setKylasLoading, setKylasModalOpen, setKylasSyncResult, setLoadingContactDeals, setLoadingContacts, setPageLoading, setSelectedDeal, setSubmitError, setSubmitSuccess, setSubmitting, setTotalCount, setTotalPages, submitLockRef, totalCount, totalPages }: {
  defaultRange: { from: string; to: string; } | null;
  escSupportDeals: { id: number; name: string; stage: string; pipeline: string; }[];
  kylasInput: string;
  pageLoading: boolean;
  setContactDeals: Dispatch<SetStateAction<AssociatedDeal[]>>;
  setContacts: Dispatch<SetStateAction<ContactResult[]>>;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  setDealContact: Dispatch<SetStateAction<Record<number, string>>>;
  setDeals: Dispatch<SetStateAction<Deal[]>>;
  setKylasDealInfo: Dispatch<SetStateAction<KylasDealInfo | null>>;
  setKylasError: Dispatch<SetStateAction<string | null>>;
  setKylasInput: Dispatch<SetStateAction<string>>;
  setKylasLoading: Dispatch<SetStateAction<boolean>>;
  setKylasModalOpen: Dispatch<SetStateAction<boolean>>;
  setKylasSyncResult: Dispatch<SetStateAction<SyncEstimateResult | null>>;
  setLoadingContactDeals: Dispatch<SetStateAction<boolean>>;
  setLoadingContacts: Dispatch<SetStateAction<boolean>>;
  setPageLoading: Dispatch<SetStateAction<boolean>>;
  setSelectedDeal: Dispatch<SetStateAction<Deal | null>>;
  setSubmitError: Dispatch<SetStateAction<string | null>>;
  setSubmitSuccess: Dispatch<SetStateAction<number | null>>;
  setSubmitting: Dispatch<SetStateAction<number | null>>;
  setTotalCount: Dispatch<SetStateAction<number>>;
  setTotalPages: Dispatch<SetStateAction<number>>;
  submitLockRef: RefObject<boolean>;
  totalCount: number;
  totalPages: number;
}) {
async function goToPage(page: number) {
  if (!defaultRange || pageLoading || page < 0 || (totalPages > 0 && page >= totalPages)) return;
  setPageLoading(true);
  try {
    const res = await fetch(
      `/api/deals/search?page=${page}&size=${DEFAULT_PAGE_SIZE}&sort=${encodeURIComponent("createdAt,desc")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: SEARCH_FIELDS,
          jsonRule: {
            condition: "AND",
            rules: [
              { id: "createdAt", field: "createdAt", type: "date", input: "date",
                operator: "between", value: [defaultRange.from, defaultRange.to] },
              SALES_PIPELINE_RULE,
            ],
            valid: true,
          },
        }),
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    const data: DealsSearchResponse = await res.json();
    const content = data.content ?? [];
    const pageSales = content.filter(isSalesDeal);
    setDeals(pageSales);
    setCurrentPage(page);
    setTotalPages(data.totalPages ?? totalPages);
    setTotalCount(data.totalElements ?? totalCount);
    loadBackgroundData(pageSales);
  } catch { /* ignore */ }
  finally { setPageLoading(false); }
}

function loadBackgroundData(filtered: Deal[]) {

  const inline: Record<number, string> = {};
  for (const d of filtered) {
    const c = (d as Deal & { associatedContacts?: { name: string }[] }).associatedContacts?.[0];
    if (c?.name) inline[d.id] = c.name;
  }
  if (Object.keys(inline).length > 0) {
    setDealContact((prev) => ({ ...prev, ...inline }));
  }
}

async function searchContacts(q: string) {
  if (!q.trim()) { setContacts([]); return; }
  setLoadingContacts(true);
  try {
    const res = await fetch(`/api/contacts/search?page=0&size=10`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: ["firstName", "lastName", "id"],
        jsonRule: {
          condition: "AND",
          rules: [{
            id: "multi_field", field: "multi_field", type: "multi_field",
            input: "multi_field", operator: "multi_field", value: q.trim(),
          }],
          valid: true,
        },
      }),
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      setContacts(data.content ?? []);
    }
  } catch { /* ignore */ }
  finally { setLoadingContacts(false); }
}

async function fetchContactDeals(contactId: number) {
  setLoadingContactDeals(true);
  setContactDeals([]);
  try {

    const res = await fetch(
      `/api/deals/search?page=0&size=200&sort=${encodeURIComponent("updatedAt,desc")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: SEARCH_FIELDS,
          jsonRule: {
            condition: "AND",
            rules: [{
              id: "createdAt", field: "createdAt", type: "date", input: "date",
              operator: "between",
              value: [
                new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
                new Date().toISOString(),
              ],
            }],
            valid: true,
          },
        }),
        cache: "no-store",
      }
    );
    if (!res.ok) return;
    const data: DealsSearchResponse = await res.json();
    const matched: AssociatedDeal[] = [];
    const all = data.content ?? [];
    const BATCH = 8;
    outer: for (let i = 0; i < all.length; i += BATCH) {
      const batch = all.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(async (d) => {
        try {
          const dr = await fetch(`/api/deals/${d.id}`, { cache: "no-store" });
          if (!dr.ok) return null;
          const dd = await dr.json();
          if (!dd.associatedContacts?.some((c: { id: number }) => c.id === contactId)) return null;
          const pName = (d.pipeline?.name ?? "").toLowerCase();
          return {
            id: d.id,
            name: d.name,
            pipeline: pName.includes("escalation") ? "escalation" : pName.includes("support") ? "support" : "sales",
            pipelineName: d.pipeline?.name ?? "—",
            stage: d.pipelineStage?.name ?? "—",
            estimatedValue: formatCurrency(d.estimatedValue),
          } as AssociatedDeal;
        } catch { return null; }
      }));
      for (const r of results) {
        if (r) matched.push(r);
        if (matched.length >= 20) break outer;
      }
    }
    setContactDeals(matched);
  } catch { /* ignore */ }
  finally { setLoadingContactDeals(false); }
}

function getOngoing(dealName: string) {
  const base = dealName.match(/((?:ENQ|MD|CT)\w+)/i)?.[1]?.toUpperCase();
  if (!base) return [];
  return escSupportDeals.filter((d) => d.name.toUpperCase().includes(base));
}

async function handleSubmit(
  dealId: number,
  selectedOptions: { id: number; name: string; requestType?: "Support" | "Escalation" }[]
) {
  if (submitLockRef.current) return;
  submitLockRef.current = true;
  setSubmitting(dealId);
  setSubmitError(null);
  setSubmitSuccess(null);
  try {
    const field = "cfRaiseEscalation";

    const requestType = selectedOptions.some((o) => o.requestType === "Escalation")
      ? "Escalation"
      : "Support";

    async function patchDeal(ops: unknown[]) {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ops),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(friendlyPatchError(j.error, res.status));
      }
    }

    let existing: unknown;
    let read = false;
    for (let attempt = 0; attempt < 2 && !read; attempt++) {
      try {
        const res = await fetch(`/api/deals/${dealId}?fresh=1`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        existing = ((await res.json())?.customFieldValues ?? {})[field];
        read = true;
      } catch {
        if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
      }
    }
    if (!read) {
      throw new Error(
        "Couldn't read this deal's current request from Kylas, so nothing was changed. Check your connection and try again."
      );
    }

    const existingArr: { id: number; name: string }[] = Array.isArray(existing)
      ? (existing as { id: number; name: string }[])
      : existing && typeof existing === "object"
        ? [existing as { id: number; name: string }]
        : [];

    const activeIds = new Set(RAISE_OPTIONS.map((o) => o.id));
    const keptValue = existingArr.filter(
      (e) => activeIds.has(e.id) && !selectedOptions.some((o) => o.id === e.id)
    );
    const mergedValue = [
      ...keptValue,
      ...selectedOptions.map((o) => ({ id: o.id, name: o.name })),
    ];

    const isReRaise = existingArr.some((e) => selectedOptions.some((o) => o.id === e.id));

    let cleared = false;
    if (isReRaise) {
      await patchDeal([{ op: "add", path: `/customFieldValues/${field}`, value: keptValue }]);
      cleared = true;
    }
    try {
      await patchDeal([
        { op: "add", path: `/customFieldValues/${field}`, value: mergedValue },
        { op: "add", path: `/customFieldValues/cfRequestType`, value: requestType },
      ]);
    } catch (err) {

      if (cleared) {
        try {
          await patchDeal([
            { op: "add", path: `/customFieldValues/${field}`, value: existingArr },
          ]);
        } catch {
          throw new Error(
            `${err instanceof Error ? err.message : "Update failed"} — and the previous value could not be restored. Check this deal's Raise Request field in Kylas.`
          );
        }
      }
      throw err;
    }
    setSubmitSuccess(dealId);
    setTimeout(() => setSubmitSuccess(null), 3000);

    setDeals((prev) => prev.map((d) => d.id === dealId
      ? { ...d, customFieldValues: { ...(d.customFieldValues ?? {}), [field]: mergedValue } }
      : d
    ));
    setSelectedDeal((prev) => prev && prev.id === dealId
      ? { ...prev, customFieldValues: { ...(prev.customFieldValues ?? {}), [field]: mergedValue } }
      : prev
    );
  } catch (err) {
    setSubmitError(err instanceof Error ? err.message : "Failed to update");
  } finally {
    submitLockRef.current = false;
    setSubmitting(null);
  }
}

async function handleFindKylasDeal(e: React.FormEvent) {
  e.preventDefault();
  if (!kylasInput.trim()) return;
  setKylasLoading(true);
  setKylasError(null);
  setKylasSyncResult(null);
  setKylasDealInfo(null);
  try {
    const result = await syncEstimate(kylasInput.trim());
    setKylasSyncResult(result);
    if (result.success && result.deal_id) {
      const info = await fetchKylasDealInfo(result.deal_id);
      setKylasDealInfo(info);
    } else if (!result.success) {
      setKylasError(result.message ?? result.error ?? "Sync failed");
    }
  } catch (err) {
    setKylasError(err instanceof Error ? err.message : "Something went wrong");
  } finally {
    setKylasLoading(false);
  }
}

function handleOpenKylasModal() {
  setKylasModalOpen(true);
  setKylasInput("");
  setKylasError(null);
  setKylasSyncResult(null);
  setKylasDealInfo(null);
}

  return { fetchContactDeals, getOngoing, goToPage, handleFindKylasDeal, handleOpenKylasModal, handleSubmit, loadBackgroundData, searchContacts };
}
