"use client";

import { useEffect, useState } from "react";
import type { DealDetail, CallLog } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}



/** Render a single custom field value */
function CfValue({ value }: { value: unknown }) {
  if (value == null || value === "") return <span className="text-gray-400">—</span>;
  if (typeof value === "string" || typeof value === "number") {
    return <span className="whitespace-pre-wrap">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <span>
        {(value as { name?: string }[])
          .map((v) => v?.name ?? String(v))
          .join(", ")}
      </span>
    );
  }
  if (typeof value === "object" && (value as { name?: string }).name) {
    return <span>{(value as { name: string }).name}</span>;
  }
  return <span>{JSON.stringify(value)}</span>;
}

// ---------------------------------------------------------------------------
// Call outcome badge
// ---------------------------------------------------------------------------

const outcomeBadge: Record<string, string> = {
  connected: "bg-green-100 text-green-700",
  missed_call: "bg-red-100 text-red-700",
  not_connected: "bg-gray-100 text-gray-600",
  voicemail: "bg-yellow-100 text-yellow-700",
};

function OutcomeBadge({ outcome }: { outcome: string }) {
  const style = outcomeBadge[outcome] ?? "bg-gray-100 text-gray-600";
  const label = outcome.replace(/_/g, " ");
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${style}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface Props {
  dealId: number;
  dealName: string;
  onClose: () => void;
}

interface DealNote {
  id: number;
  description: string;
  createdAt?: string;
  ownerId?: number;
}

export default function DealDetailPanel({ dealId, dealName, onClose }: Props) {
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [notes, setNotes] = useState<DealNote[]>([]);
  const [loadingDeal, setLoadingDeal] = useState(true);
  const [loadingCalls, setLoadingCalls] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [dealError, setDealError] = useState<string | null>(null);

  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSuccess, setNoteSuccess] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingDeal(true);
    setLoadingCalls(true);
    setLoadingNotes(true);
    setDeal(null);
    setCallLogs([]);
    setNotes([]);
    setDealError(null);

    const dealPromise = fetch(`/api/deals/${dealId}`, { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null);

    // Deal details
    dealPromise
      .then((d) => { if (d) setDeal(d); else setDealError("Failed to load deal"); })
      .catch((e) => setDealError(String(e)))
      .finally(() => setLoadingDeal(false));

    // Notes (needs ownedBy from deal)
    dealPromise
      .then((d: { ownedBy?: { id: number } | null } | null) => {
        if (!d) return;
        loadNotes(d.ownedBy?.id ?? null);
      })
      .catch(() => setNotes([]))
      .finally(() => setLoadingNotes(false));

    // Call logs: get contact → get phone/leads → match against global call feed
    dealPromise
      .then(async (d: { associatedContacts?: { id: number }[] } | null) => {
        if (!d) { setCallLogs([]); return; }
        const contactId = d.associatedContacts?.[0]?.id;
        if (!contactId) { setCallLogs([]); return; }

        const contactResp = await fetch(`/api/contacts/${contactId}`, { cache: "no-store" })
          .then((r) => r.json()).catch(() => null);

        const callsContent: CallLog[] = [];
        for (let pg = 1; pg <= 3; pg++) {
          await new Promise((r) => setTimeout(r, 400));
          try {
            const r = await fetch(`/api/call-logs?size=500&page=${pg}`, { cache: "no-store" });
            if (r.status === 429) {
              await new Promise((w) => setTimeout(w, 1500));
              const retry = await fetch(`/api/call-logs?size=500&page=${pg}`, { cache: "no-store" });
              if (retry.ok) { const d = await retry.json(); callsContent.push(...(d.content ?? [])); }
            } else if (r.ok) {
              const d = await r.json(); callsContent.push(...(d.content ?? []));
            }
          } catch { /* skip */ }
        }

        const phones = ((contactResp?.phoneNumbers ?? []) as { value?: string; dialCode?: string }[])
          .map((p) => (`${p.dialCode ?? ""}${p.value ?? ""}`).replace(/\D/g, ""))
          .filter((p) => p.length >= 7);
        const leadIds = ((contactResp?.convertedLeads ?? []) as { id: number }[]).map((l) => l.id);

        const allCalls: CallLog[] = callsContent;
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
        setCallLogs(matched.slice(0, 10));
      })
      .catch(() => setCallLogs([]))
      .finally(() => setLoadingCalls(false));
  }, [dealId]);

  function loadNotes(ownerId: number | null) {
    const params = new URLSearchParams({
      targetEntityId: String(dealId),
      targetEntityType: "DEAL",
      sort: "createdAt,desc",
      page: "0",
      size: "20",
    });
    if (ownerId) params.set("targetEntityOwnerId", String(ownerId));
    fetch(`/api/notes/relation?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { content?: { id: number; description?: string; createdAt?: string | number; ownerId?: number }[] }) => {
        const matched: DealNote[] = (d?.content ?? []).map((n) => ({
          id: n.id,
          description: (n.description ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim(),
          createdAt: typeof n.createdAt === "number" ? new Date(n.createdAt).toISOString() : n.createdAt,
          ownerId: n.ownerId,
        }));
        setNotes(matched);
      })
      .catch(() => {});
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    setNoteError(null);
    setNoteSuccess(false);
    try {
      const res = await fetch("/api/notes/relation/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceEntity: { description: `<div><b>[Dashboard]</b> ${noteText.trim()}</div>` },
          targetEntityId: String(dealId),
          targetEntityType: "DEAL",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed: ${res.status}`);
      }
      setNoteText("");
      setNoteSuccess(true);
      setTimeout(() => setNoteSuccess(false), 3000);
      loadNotes(deal?.ownedBy?.id ?? null);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setSavingNote(false);
    }
  }

  async function handleUpload(files: FileList | null) {
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
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    /* Overlay */
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="relative w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">
              Deal Details
            </p>
            <h2 className="text-base font-bold text-gray-900 leading-tight">
              {dealName}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-gray-400 hover:text-gray-600 transition-colors mt-0.5"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">

          {/* Escalation details */}
          <section className="px-6 py-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Escalation Details
            </h3>
            {loadingDeal ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-5 rounded bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : dealError ? (
              <p className="text-sm text-red-600">{dealError}</p>
            ) : deal ? (
              <dl className="grid grid-cols-1 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-gray-400">Raise Escalation</dt>
                  <dd className="font-medium text-gray-800 mt-0.5">
                    <CfValue value={deal.customFieldValues?.["cfRaiseEscalation"]} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">RCA</dt>
                  <dd className="font-medium text-gray-800 mt-0.5">
                    <CfValue value={deal.customFieldValues?.["cfRcaEscalationReason"]} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">Attribution</dt>
                  <dd className="font-medium text-gray-800 mt-0.5">
                    <CfValue value={deal.customFieldValues?.["cfEscalationClassification"]} />
                  </dd>
                </div>
              </dl>
            ) : null}
          </section>

          {/* Notes */}
          <section className="px-6 py-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Notes
              {!loadingNotes && notes.length > 0 && (
                <span className="ml-2 text-gray-300 normal-case tracking-normal font-normal">
                  ({notes.length})
                </span>
              )}
            </h3>
            {loadingNotes ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="h-10 rounded bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : notes.length === 0 ? (
              <p className="text-sm text-gray-400">No notes found for this deal.</p>
            ) : (
              <ul className="space-y-2">
                {notes.map((note) => (
                  <li key={note.id} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-sm text-gray-800">{note.description}</p>
                    {note.createdAt && (
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(note.createdAt).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Add note */}
          <section className="px-6 py-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Add Note
            </h3>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Type a note…"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={handleAddNote}
                disabled={savingNote || !noteText.trim()}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {savingNote ? "Saving…" : "Save Note"}
              </button>
              {noteSuccess && (
                <span className="text-xs text-green-600 font-medium">Note added to CRM</span>
              )}
              {noteError && (
                <span className="text-xs text-red-600">{noteError}</span>
              )}
            </div>
          </section>

          {/* Upload document */}
          <section className="px-6 py-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Upload Document
            </h3>
            <label
              className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-4 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors ${
                uploading ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span className="text-sm text-gray-500">
                {uploading ? "Uploading…" : "Click to select files"}
              </span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
                disabled={uploading}
              />
            </label>
            {uploadSuccess && (
              <p className="text-xs text-green-600 font-medium mt-2">Document uploaded to CRM</p>
            )}
            {uploadError && (
              <p className="text-xs text-red-600 mt-2">{uploadError}</p>
            )}
          </section>

          {/* Recent call logs */}
          <section className="px-6 py-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Recent Call Logs
              {!loadingCalls && callLogs.length > 0 && (
                <span className="ml-2 text-gray-300 normal-case tracking-normal font-normal">
                  ({callLogs.length} shown)
                </span>
              )}
            </h3>

            {loadingCalls ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-14 rounded bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : callLogs.length === 0 ? (
              <p className="text-sm text-gray-400">No call logs found for this deal.</p>
            ) : (
              <ul className="space-y-2">
                {callLogs.map((log) => (
                  <li
                    key={log.id}
                    className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <OutcomeBadge outcome={log.outcome} />
                        <span className="text-xs text-gray-500 capitalize">
                          {log.callType.replace(/_/g, " ")}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {formatDateTime(log.startTime)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                      {log.owner && (
                        <span>
                          <span className="text-gray-400">Agent: </span>
                          {log.owner.name}
                        </span>
                      )}
                      <span>
                        <span className="text-gray-400">Duration: </span>
                        {formatDuration(log.duration)}
                      </span>
                      <span>
                        <span className="text-gray-400">Phone: </span>
                        {log.phoneNumber}
                      </span>
                    </div>
                    {log.callSummary && (
                      <p className="mt-1.5 text-xs text-gray-500 italic">
                        {log.callSummary}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
