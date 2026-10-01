'use client';

import { useEffect, useState } from 'react';
import { EscSupportDeal } from '../types';

export function RaiseField({
  label,
  options,
  onSubmit,
  submitting,
  findExisting,
  onOpenExisting,
  onAddNote,
  succeeded,
}: {
  label: string;
  options: { id: number; name: string; label?: string; requestType?: "Support" | "Escalation" }[];
  onSubmit: (opts: { id: number; name: string; requestType?: "Support" | "Escalation" }[], notes?: string) => void;
  submitting: boolean;
  findExisting?: (reasonId: number) => EscSupportDeal | undefined;
  onOpenExisting?: (ticket: EscSupportDeal) => void;
  onAddNote?: (ticketId: number, text: string) => Promise<void>;
  succeeded?: boolean;
}) {

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [noteState, setNoteState] = useState<{ saving: boolean; savedOn: number | null; error: string | null }>({ saving: false, savedOn: null, error: null });

  const selectedOption = selectedIdx === null ? null : options[selectedIdx];
  const isPending = selectedOption?.id === 0;
  const existing = selectedOption ? findExisting?.(selectedOption.id) : undefined;

  useEffect(() => {
    if (!succeeded) return;
    setNotes("");
    setSelectedIdx(null);
  }, [succeeded]);

  async function handleAddNote(ticket: EscSupportDeal) {
    if (!onAddNote || !notes.trim()) return;
    setNoteState({ saving: true, savedOn: null, error: null });
    try {
      await onAddNote(ticket.id, notes);
      setNotes("");
      setNoteState({ saving: false, savedOn: ticket.id, error: null });
    } catch (err) {
      setNoteState({ saving: false, savedOn: null, error: err instanceof Error ? err.message : "Could not add the note" });
    }
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {options.map((o, i) => (
          <button
            key={`${o.id}-${i}`}
            type="button"
            disabled={submitting}
            onClick={() => { setSelectedIdx(selectedIdx === i ? null : i); setNoteState({ saving: false, savedOn: null, error: null }); }}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-40 ${
              selectedIdx === i
                ? "bg-gray-950 text-yellow-400 border-gray-950"
                : "bg-white text-gray-700 border-gray-300 active:bg-gray-100"
            }`}
          >
            {o.label ?? o.name}
          </button>
        ))}
      </div>
      {existing && (
        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-semibold text-amber-800">
            {existing.closed ? "A ticket for this issue was already closed on this order" : "A ticket for this issue is already open on this order"}
          </p>
          <p className="text-xs text-gray-800 mt-1 truncate">{existing.name}</p>
          <p className="text-[10px] text-gray-600">
            {existing.stage} · RCA: {existing.rca || "—"} · Resolution: {existing.resolution || "—"}
          </p>
          <div className="flex gap-2 mt-2">
            {onOpenExisting && (
              <button
                type="button"
                onClick={() => onOpenExisting(existing)}
                className="px-2.5 py-1 rounded-md border border-amber-300 bg-white text-xs font-medium text-amber-800"
              >
                Open ticket
              </button>
            )}
            {onAddNote && (
              <button
                type="button"
                onClick={() => handleAddNote(existing)}
                disabled={submitting || noteState.saving || !notes.trim()}
                className="px-2.5 py-1 rounded-md border border-amber-300 bg-white text-xs font-medium text-amber-800 disabled:opacity-50"
              >
                {noteState.saving ? "Adding…" : "Add note to this ticket"}
              </button>
            )}
          </div>
          {noteState.savedOn === existing.id && <p className="text-[10px] text-green-700 mt-1">Note added to the existing ticket</p>}
          {noteState.error && <p className="text-[10px] text-red-600 mt-1">{noteState.error}</p>}
          <p className="text-[10px] text-gray-500 mt-1">Different problem? Submit below still creates a new ticket.</p>
        </div>
      )}
      {selectedOption && (
        <p className="text-xs font-medium text-gray-500 mb-1">
          Notes <span className="font-normal text-gray-400">(optional)</span>
        </p>
      )}
      {selectedOption && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting}
          maxLength={2550}
          rows={3}
          placeholder="Ticket notes — what happened, what the customer needs"
          className="w-full mb-2 px-3 py-2 rounded-lg border border-gray-300 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-950 disabled:opacity-50"
        />
      )}
      {selectedOption && (
        <button
          onClick={() => { if (!isPending) onSubmit([selectedOption], notes); }}
          disabled={submitting || isPending}
          className="w-full py-2 rounded-lg bg-yellow-400 text-gray-950 text-sm font-bold disabled:opacity-50"
        >
          {isPending ? "Pending Kylas ID" : submitting ? "Raising… confirming with Kylas" : existing ? "Create a new ticket anyway" : "Submit"}
        </button>
      )}
    </div>
  );
}
