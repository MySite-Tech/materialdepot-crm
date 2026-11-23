'use client';

import { pacedFetch } from './net';

import { EscalationDetail } from './ui/detail';
import { EscalationList } from './list';
import { EscalationSearch } from './ui/search';

import { PAGE_SIZE } from './constants';
import { MobileEscalationProps, NoteEntry, TimelineEntry } from './types';
import { buildBody, isEscalationOrSupport, parseTimeline } from './utils';
import { getEscalationRaisedBy } from '@/lib/api';
import { CallLog, Deal, DealsSearchResponse } from '@/lib/types';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function MobileEscalationClient({ jumpToSearch, userName }: MobileEscalationProps) {
  const hasJump = !!jumpToSearch;
  const [query, setQuery] = useState(hasJump ? jumpToSearch : "");
  const [inputValue, setInputValue] = useState(hasJump ? jumpToSearch : "");
  const [exactMode, setExactMode] = useState(hasJump);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
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


  const fetchDeals = useCallback(
    async (searchQuery: string) => {
      setLoading(true);
      setError(null);
      setCallLogMap({});
      setNoteMap({});
      setContactMap({});
      try {
        const res = await fetch(
          `/api/deals/search?page=0&size=${PAGE_SIZE}&sort=${encodeURIComponent("updatedAt,desc")}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildBody(searchQuery, null, null)),
            cache: "no-store",
          }
        );
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? `Request failed: ${res.status}`);
        }
        const data: DealsSearchResponse = await res.json();
        let filtered = (data.content ?? []).filter(isEscalationOrSupport);
        const q = searchQuery.trim().toUpperCase();
        if (exactMode) filtered = filtered.filter((d) => d.name.toUpperCase() === q);
        else filtered = filtered.filter((d) => d.name.toUpperCase().includes(q) || String(d.id) === q);
        setDeals(filtered);
        return filtered;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        return [];
      } finally {
        setLoading(false);
      }
    },
    [exactMode]
  );

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
    if (!query.trim() || fetchKeyRef.current === query) return;
    fetchKeyRef.current = query;
    fetchDeals(query).then((deals) => populateContacts(deals));
  }, [fetchDeals, populateContacts, query]);


  const [timelineLoading, setTimelineLoading] = useState<number | null>(null);

  async function loadTimeline(dealId: number) {
    if (timelineMap[dealId] || timelineLoading === dealId) return;
    setTimelineLoading(dealId);
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
      const feedsData = feedsRes?.ok ? await feedsRes.json() : { content: [] };
      setTimelineMap((prev) => ({ ...prev, [dealId]: parseTimeline(feedsData.content ?? []) }));
    } catch {
      setTimelineMap((prev) => ({ ...prev, [dealId]: [] }));
    } finally {
      setTimelineLoading(null);
    }
  }

  function appendLocalNote(dealId: number, text: string) {
    if (expandedDealId !== dealId) return;
    setDealNotes((prev) => [
      { id: -Date.now(), description: `[${userName ?? "Unknown"}] ${text}`, createdAt: new Date().toISOString() },
      ...prev,
    ]);
  }

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

      if (!contactId) return;

      try {
        const callRes = await pacedFetch(`/api/call-logs/search?page=1&size=10&sort=${encodeURIComponent("createdAt,desc")}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonRule: {
              condition: "AND",
              rules: [
                { field: "related_to", operator: "equal", id: "related_to", type: "related_lookup", value: { entity: "contact", id: String(contactId) } },
              ],
              valid: true,
            },
          }),
        });
        const callData = callRes?.ok ? await callRes.json() : { content: [] };
        const calls = ((callData.content ?? []) as CallLog[])
          .slice()
          .sort((a, b) => new Date(b.startTime ?? b.createdAt).getTime() - new Date(a.startTime ?? a.createdAt).getTime());
        setExpandedCallLogs(calls.slice(0, 10));
      } catch { /* skip */ }
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
      appendLocalNote(dealId, savedText);
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
      const noteRes = await fetch("/api/notes/relation/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceEntity: { description: `<div><b>[${userName ?? "Unknown"}]</b> uploaded: ${fileNames}</div>` },
          targetEntityId: String(dealId),
          targetEntityType: "DEAL",
        }),
      }).catch(() => null);
      setUploadSuccess(true);
      setUploadTargetDeal(null);
      setLastAction((prev) => ({ ...prev, [dealId]: { type: "doc", text: fileNames } }));
      setTimeout(() => setUploadSuccess(false), 5000);
      if (noteRes?.ok) appendLocalNote(dealId, `uploaded: ${fileNames}`);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = inputValue.trim();
    if (!q) return;
    setExactMode(false);
    fetchKeyRef.current = "";
    setQuery(q);
  }

  function handleClear() {
    setInputValue("");
    setQuery("");
    setDeals([]);
    setError(null);
    setExactMode(false);
    fetchKeyRef.current = "";
  }

  return (
    <div className="w-full">

      <EscalationSearch
        handleClear={handleClear}
        handleSearch={handleSearch}
        inputValue={inputValue}
        loading={loading}
        setInputValue={setInputValue}
      />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && deals.length > 0 && (
        <EscalationList
        contactMap={contactMap}
        filteredDeals={deals}
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

      {!loading && !error && !query && (
        <div className="mt-2 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-yellow-50">
            <svg className="h-5 w-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-900">Track an escalation or support request</p>
          <p className="mt-1 text-sm text-gray-500">
            Search to see its current stage, owner, notes and call history.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
            {["ENQ20261123105648", "Ticket #5012823", "9876543210"].map((ex) => (
              <span key={ex} className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">e.g. {ex}</span>
            ))}
          </div>
          <p className="mt-4 text-xs text-gray-400">Just raised something? It shows up here within a minute.</p>
        </div>
      )}

      {!loading && !error && query && deals.length === 0 && (
        <div className="mt-2 rounded-xl border border-gray-200 bg-white px-6 py-10 text-center">
          <p className="text-sm font-semibold text-gray-900">No requests found for &ldquo;{query}&rdquo;</p>
          <p className="mt-1 text-sm text-gray-500">Check the ENQ id or ticket id. New requests can take a minute to appear.</p>
        </div>
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
        timelineLoading={timelineLoading === selectedDeal.id}
        onLoadTimeline={() => loadTimeline(selectedDeal.id)}
      />
      )}
    </div>
  );
}
