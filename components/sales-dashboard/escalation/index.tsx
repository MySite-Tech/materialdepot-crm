'use client';

import { pacedFetch } from './net';

import { EscalationDetail } from './ui/detail';
import { EscalationFilters } from './ui/filters';
import { EscalationList } from './list';
import { EscalationPager } from './list/pager';
import { EscalationSearch } from './ui/search';
import { EscalationStats } from './list/stats';

import { PAGE_SIZE } from './constants';
import { DateFilter, MobileEscalationProps, NoteEntry, StatusFilter, TimelineEntry } from './types';
import { buildBody, classifyStage, dateFilterLabel, dateFilterRange, endOfDay, isEscalationOrSupport, parseTimeline, startOfDay } from './utils';
import { getEscalationRaisedBy } from '@/lib/api';
import { CallLog, Deal, DealsSearchResponse } from '@/lib/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export default function MobileEscalationClient({ jumpToSearch, userName }: MobileEscalationProps) {
  const hasJump = !!jumpToSearch;
  const [query, setQuery] = useState(hasJump ? jumpToSearch : "");
  const [inputValue, setInputValue] = useState(hasJump ? jumpToSearch : "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exactMode, setExactMode] = useState(hasJump);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [expandedDealId, setExpandedDealId] = useState<number | null>(null);
  const [expandedCallLogs, setExpandedCallLogs] = useState<CallLog[]>([]);
  const [dealNotes, setDealNotes] = useState<{ id: number; description: string; createdAt?: string }[]>([]);
  const [timelineMap, setTimelineMap] = useState<Record<number, TimelineEntry[]>>({});
  const [loadingExpanded, setLoadingExpanded] = useState(false);
  const [raisedBy, setRaisedBy] = useState<string | null>(null);

  const [noteTargetDeal, setNoteTargetDeal] = useState<number | null>(null);
  const [uploadTargetDeal, setUploadTargetDeal] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSuccess, setNoteSuccess] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [lastAction, setLastAction] = useState<Record<number, { type: "note" | "doc"; text: string }>>({});

  const [, setCallLogMap] = useState<
    Record<number, { incoming: CallLog | null; outgoing: CallLog | null }>
  >({});
  const [, setNoteMap] = useState<Record<number, NoteEntry | null>>({});
  const [contactMap, setContactMap] = useState<
    Record<number, { id: number; name: string } | null>
  >({});

  const [activeDateFilter, setActiveDateFilter] = useState<DateFilter>("all");
  const [activeStatusFilter, setActiveStatusFilter] = useState<StatusFilter>("all");

  const fetchDeals = useCallback(
    async (searchQuery: string, fromStr: string, toStr: string, page: number = 0) => {
      if (page === 0) setLoading(true);
      else setPageLoading(true);
      setError(null);
      if (page === 0) {
        setCallLogMap({});
        setNoteMap({});
        setContactMap({});
      }
      const fromIso = fromStr ? startOfDay(fromStr).toISOString() : null;
      const toIso = toStr ? endOfDay(toStr).toISOString() : null;
      try {
        const res = await fetch(
          `/api/deals/search?page=${page}&size=${PAGE_SIZE}&sort=${encodeURIComponent("updatedAt,desc")}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildBody(searchQuery, fromIso, toIso)),
            cache: "no-store",
          }
        );
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? `Request failed: ${res.status}`);
        }
        const data: DealsSearchResponse = await res.json();
        let filtered = (data.content ?? []).filter(isEscalationOrSupport);
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toUpperCase();
          if (exactMode) filtered = filtered.filter((d) => d.name.toUpperCase() === q);
          else filtered = filtered.filter((d) => d.name.toUpperCase().includes(q));
        }
        setDeals(filtered);
        setTotalElements(data.totalElements ?? filtered.length);
        setTotalPages(data.totalPages ?? 0);
        setCurrentPage(page);
        return filtered;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        return [];
      } finally {
        setLoading(false);
        setPageLoading(false);
      }
    },
    [exactMode]
  );

  function goToPage(p: number) {
    if (pageLoading || p < 0 || (totalPages > 0 && p >= totalPages)) return;
    fetchDeals(query ?? "", from, to, p).then((deals) => populateContacts(deals));
  }



  const populateContacts = useCallback((dealList: Deal[]) => {
    setContactMap((prev) => {
      const next = { ...prev };
      for (const deal of dealList) {
        if (next[deal.id] !== undefined) continue;
        const c = deal.associatedContacts?.[0];
        next[deal.id] = c ? { id: c.id, name: c.name ?? '' } : null;
      }
      return next;
    });
  }, []);

  const fetchKeyRef = useRef("");

  useEffect(() => {
    const key = `${query}|${from}|${to}`;
    if (fetchKeyRef.current === key) return;
    fetchKeyRef.current = key;
    fetchDeals(query, from, to).then((deals) => populateContacts(deals));
  }, [fetchDeals, populateContacts, query, from, to]);


  async function handleExpandDeal(dealId: number) {
    if (expandedDealId === dealId) {
      setExpandedDealId(null);
      return;
    }
    setExpandedDealId(dealId);
    setLoadingExpanded(true);
    setExpandedCallLogs([]);
    setDealNotes([]);
    setRaisedBy(null);

    getEscalationRaisedBy(dealId)
      .then((r) => setRaisedBy(r?.raised_by ?? null))
      .catch(() => setRaisedBy(null));

    try {

      const detailRes = await pacedFetch(`/api/deals/${dealId}`);
      const detail = detailRes?.ok ? await detailRes.json() : null;
      if (!detail) { setLoadingExpanded(false); return; }

      const contactId = detail.associatedContacts?.[0]?.id;
      const ownerId = detail.ownedBy?.id;

      const noteParams = new URLSearchParams({
        targetEntityId: String(dealId),
        targetEntityType: "DEAL",
        sort: "createdAt,desc",
        page: "0",
        size: "20",
      });
      if (ownerId) noteParams.set("targetEntityOwnerId", String(ownerId));
      const notesRes = await pacedFetch(`/api/notes/relation?${noteParams}`);
      const notesData = notesRes?.ok ? await notesRes.json() : { content: [] };
      setDealNotes(
        (notesData.content ?? []).map((n: { id: number; description?: string; createdAt?: string | number }) => ({
          id: n.id,
          description: (n.description ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim(),
          createdAt: typeof n.createdAt === "number" ? new Date(n.createdAt).toISOString() : n.createdAt,
        }))
      );

      setLoadingExpanded(false);

      if (!timelineMap[dealId]) {
        try {
          const feedsRes = await pacedFetch(
            `/api/feeds/search?page=0&size=50&sort=performedAt%2Cdesc`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonRule: {
                  condition: "AND",
                  rules: [
                    { field: "related_to", operator: "equal", id: "related_to", type: "related_lookup", value: { entity: "deal", id: String(dealId) } },
                    { field: "systemDefault", operator: "equal", id: "systemDefault", type: "boolean", value: false },
                    { field: "category", operator: "equal", id: "category", type: "string", value: "ALL" },
                  ],
                  valid: true,
                },
              }),
            }
          );
          if (feedsRes?.ok) {
            const feedsData = await feedsRes.json();
            setTimelineMap((prev) => ({ ...prev, [dealId]: parseTimeline(feedsData.content ?? []) }));
          }
        } catch { /* skip */ }
      }

      if (!contactId) return;

      try {
        const contactRes = await pacedFetch(`/api/contacts/${contactId}`);
        const contactData = contactRes?.ok ? await contactRes.json() : null;
        const phones = ((contactData?.phoneNumbers ?? []) as { value?: string; dialCode?: string }[])
          .map((p) => (`${p.dialCode ?? ""}${p.value ?? ""}`).replace(/\D/g, ""))
          .filter((p) => p.length >= 7);
        const leadIds = ((contactData?.convertedLeads ?? []) as { id: number }[]).map((l) => l.id);

        const allCalls: CallLog[] = [];
        for (let pg = 1; pg <= 3; pg++) {
          await new Promise((r) => setTimeout(r, 500));
          const r = await pacedFetch(`/api/call-logs?size=500&page=${pg}`);
          if (r?.ok) {
            const d = await r.json();
            allCalls.push(...(d.content ?? []));
          }
        }

        const matched = allCalls
          .filter((c) => {
            const cands = [c.phoneNumber, c.originator, c.receiver]
              .map((v) => (v ?? "").replace(/\D/g, ""))
              .filter((s) => s.length >= 7);
            const pMatch = cands.some((cn) => phones.some((ph) => cn.slice(-10) === ph.slice(-10)));
            const rels = c.relatedTo ?? [];
            const rMatch = rels.some(
              (r) =>
                (r.entity === "contact" && r.id === contactId) ||
                (r.entity === "lead" && leadIds.includes(r.id))
            );
            return pMatch || rMatch;
          })
          .sort((a, b) => new Date(b.startTime ?? b.createdAt).getTime() - new Date(a.startTime ?? a.createdAt).getTime());
        setExpandedCallLogs(matched.slice(0, 10));
      } catch { /* skip */ }
    } catch { /* ignore */ }
  }

  async function reloadDealNotes(dealId: number) {
    try {
      const detail = await fetch(`/api/deals/${dealId}`, { cache: "no-store" }).then((r) => r.json());
      const ownerId = detail.ownedBy?.id;
      const noteParams = new URLSearchParams({
        targetEntityId: String(dealId),
        targetEntityType: "DEAL",
        sort: "createdAt,desc",
        page: "0",
        size: "20",
      });
      if (ownerId) noteParams.set("targetEntityOwnerId", String(ownerId));
      const notesRes = await fetch(`/api/notes/relation?${noteParams}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ content: [] }));
      setDealNotes(
        (notesRes.content ?? []).map((n: { id: number; description?: string; createdAt?: string | number }) => ({
          id: n.id,
          description: (n.description ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim(),
          createdAt: typeof n.createdAt === "number" ? new Date(n.createdAt).toISOString() : n.createdAt,
        }))
      );
    } catch { /* ignore */ }
  }

  async function handleAddNote(dealId: number) {
    if (!noteText.trim()) return;
    setSavingNote(true);
    setNoteError(null);
    setNoteSuccess(false);
    try {
      const res = await fetch("/api/notes/relation/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceEntity: { description: `<div><b>[${userName ?? "Unknown"}]</b> ${noteText.trim()}</div>` },
          targetEntityId: String(dealId),
          targetEntityType: "DEAL",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed: ${res.status}`);
      }
      const savedText = noteText.trim();
      setNoteText("");
      setNoteSuccess(true);
      setNoteTargetDeal(null);
      setLastAction((prev) => ({ ...prev, [dealId]: { type: "note", text: savedText } }));
      setTimeout(() => setNoteSuccess(false), 5000);
      reloadDealNotes(dealId);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setSavingNote(false);
    }
  }

  async function handleUpload(dealId: number, files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files[]", files[i]);
      }
      formData.append("entityId", String(dealId));
      formData.append("entityType", "deal");
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed: ${res.status}`);
      }

      const fileNames = Array.from(files).map((f) => f.name).join(", ");
      await fetch("/api/notes/relation/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceEntity: { description: `<div><b>[${userName ?? "Unknown"}]</b> uploaded: ${fileNames}</div>` },
          targetEntityId: String(dealId),
          targetEntityType: "DEAL",
        }),
      }).catch(() => {});
      setUploadSuccess(true);
      setUploadTargetDeal(null);
      setLastAction((prev) => ({ ...prev, [dealId]: { type: "doc", text: fileNames } }));
      setTimeout(() => setUploadSuccess(false), 5000);
      reloadDealNotes(dealId);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setExactMode(false);
    setQuery(inputValue);
  }

  function handleClear() {
    setInputValue("");
    setQuery("");
    setExactMode(false);
    const r = dateFilterRange(activeDateFilter);
    setFrom(r.from);
    setTo(r.to);
  }

  function handleDateChip(chip: DateFilter) {
    setActiveDateFilter(chip);
    const r = dateFilterRange(chip);
    setFrom(r.from);
    setTo(r.to);
  }

  const statusCounts = useMemo(() => {
    const counts = { all: deals.length, open: 0, waiting: 0, resolved: 0 };
    for (const d of deals) {
      const cat = classifyStage(d.pipelineStage?.name ?? "");
      if (cat === "open") counts.open++;
      else if (cat === "waiting") counts.waiting++;
      else if (cat === "resolved") counts.resolved++;
    }
    return counts;
  }, [deals]);

  const filteredDeals = useMemo(() => {
    if (activeStatusFilter === "all") return deals;
    return deals.filter((d) => classifyStage(d.pipelineStage?.name ?? "") === activeStatusFilter);
  }, [deals, activeStatusFilter]);

  return (
    <div className="w-full">

      <EscalationSearch
        handleClear={handleClear}
        handleSearch={handleSearch}
        inputValue={inputValue}
        setInputValue={setInputValue}
      />

      <EscalationFilters
        activeDateFilter={activeDateFilter}
        handleDateChip={handleDateChip}
      />

      <EscalationStats
        activeStatusFilter={activeStatusFilter}
        setActiveStatusFilter={setActiveStatusFilter}
        statusCounts={statusCounts}
        totalElements={totalElements}
      />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <p className="text-xs text-gray-500 mb-3">
          {filteredDeals.length} request{filteredDeals.length !== 1 ? "s" : ""}
          {" · "}
          {dateFilterLabel(activeDateFilter)}
          {query ? ` · "${query}"` : ""}
        </p>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && filteredDeals.length > 0 && (
        <EscalationList
        contactMap={contactMap}
        filteredDeals={filteredDeals}
        handleAddNote={handleAddNote}
        handleExpandDeal={handleExpandDeal}
        handleUpload={handleUpload}
        lastAction={lastAction}
        noteError={noteError}
        noteSuccess={noteSuccess}
        noteTargetDeal={noteTargetDeal}
        noteText={noteText}
        savingNote={savingNote}
        selectedDeal={selectedDeal}
        setNoteTargetDeal={setNoteTargetDeal}
        setNoteText={setNoteText}
        setSelectedDeal={setSelectedDeal}
        setUploadTargetDeal={setUploadTargetDeal}
        timelineMap={timelineMap}
        uploadError={uploadError}
        uploadSuccess={uploadSuccess}
        uploadTargetDeal={uploadTargetDeal}
        uploading={uploading}
      />
      )}

      {!loading && !error && filteredDeals.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          No requests found.
        </div>
      )}

      {!loading && !error && totalPages > 1 && (
        <EscalationPager
        currentPage={currentPage}
        goToPage={goToPage}
        pageLoading={pageLoading}
        totalElements={totalElements}
        totalPages={totalPages}
      />
      )}

      {selectedDeal && (
        <EscalationDetail
        dealNotes={dealNotes}
        expandedCallLogs={expandedCallLogs}
        loadingExpanded={loadingExpanded}
        raisedBy={raisedBy}
        selectedDeal={selectedDeal}
        setSelectedDeal={setSelectedDeal}
        timelineMap={timelineMap}
      />
      )}
    </div>
  );
}
