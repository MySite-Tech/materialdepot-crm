'use client';

import { Deal } from '../../../lib/types/index';
import { TimelineEntry } from '../types/escalation';
import { cardBorderColor, relativeAge, stagePillStyle } from '../utils/escalation';
import { Dispatch, SetStateAction } from 'react';

export function EscalationList({ contactMap, filteredDeals, handleAddNote, handleExpandDeal, handleUpload, lastAction, noteError, noteSuccess, noteTargetDeal, noteText, savingNote, selectedDeal, setNoteTargetDeal, setNoteText, setSelectedDeal, setUploadTargetDeal, timelineMap, uploadError, uploadSuccess, uploadTargetDeal, uploading }: {
  contactMap: Record<number, { id: number; name: string; } | null>;
  filteredDeals: Deal[];
  handleAddNote: (dealId: number) => Promise<void>;
  handleExpandDeal: (dealId: number) => Promise<void>;
  handleUpload: (dealId: number, files: FileList | null) => Promise<void>;
  lastAction: Record<number, { type: "note" | "doc"; text: string; }>;
  noteError: string | null;
  noteSuccess: boolean;
  noteTargetDeal: number | null;
  noteText: string;
  savingNote: boolean;
  selectedDeal: Deal | null;
  setNoteTargetDeal: Dispatch<SetStateAction<number | null>>;
  setNoteText: Dispatch<SetStateAction<string>>;
  setSelectedDeal: Dispatch<SetStateAction<Deal | null>>;
  setUploadTargetDeal: Dispatch<SetStateAction<number | null>>;
  timelineMap: Record<number, TimelineEntry[]>;
  uploadError: string | null;
  uploadSuccess: boolean;
  uploadTargetDeal: number | null;
  uploading: boolean;
}) {
  return (
    <div className="space-y-3">
      {filteredDeals.map((deal) => {
        const timeline = timelineMap[deal.id] ?? [];
        return (
          <div
            key={deal.id}
            onClick={() => {
              if (selectedDeal?.id === deal.id) {
                setSelectedDeal(null);
              } else {
                setSelectedDeal(deal);
                handleExpandDeal(deal.id);
              }
            }}
            className={`rounded-xl border border-l-4 overflow-hidden cursor-pointer transition-colors ${cardBorderColor(deal)} ${
              selectedDeal?.id === deal.id ? "border-yellow-400 bg-yellow-50/60" : "border-gray-200 hover:bg-yellow-50/40"
            }`}
          >
    
            <div className="p-3">
    
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <h3 className="text-sm font-bold text-gray-900 leading-tight truncate flex-1">
                  {deal.name}
                </h3>
                {deal.pipelineStage?.name && (
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${stagePillStyle(deal)}`}>
                    {deal.pipelineStage.name}
                  </span>
                )}
              </div>
    
              <div className="flex items-center gap-2 mb-3 text-xs text-gray-500 flex-wrap">
                <><span className="text-yellow-700 font-medium">{contactMap[deal.id]?.name ?? "User"}</span><span>·</span></>
                {deal.ownedBy?.name && <span>{deal.ownedBy.name}</span>}
                {deal.ownedBy?.name && deal.createdAt && <span>·</span>}
                {deal.createdAt && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-medium text-gray-600">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {relativeAge(deal.createdAt)}
                  </span>
                )}
              </div>
    
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setNoteTargetDeal(noteTargetDeal === deal.id ? null : deal.id); }}
                  className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-500 cursor-pointer"
                  title="Add Note"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setUploadTargetDeal(uploadTargetDeal === deal.id ? null : deal.id); }}
                  className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-500 cursor-pointer"
                  title="Upload Doc"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                </button>
              </div>
    
              {noteTargetDeal === deal.id && (
                <div className="mt-3 border-t border-gray-100 pt-3" onClick={(e) => e.stopPropagation()}>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Type a note\u2026"
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
                  />
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      onClick={() => handleAddNote(deal.id)}
                      disabled={savingNote || !noteText.trim()}
                      className="px-4 py-1.5 rounded-lg bg-gray-950 text-yellow-400 text-xs font-semibold disabled:opacity-50"
                    >
                      {savingNote ? "Saving\u2026" : "Save"}
                    </button>
                    <button onClick={() => setNoteTargetDeal(null)} className="text-xs text-gray-400">Cancel</button>
                    {noteSuccess && <span className="text-xs text-green-600">Saved</span>}
                    {noteError && <span className="text-xs text-red-600">{noteError}</span>}
                  </div>
                </div>
              )}
    
              {uploadTargetDeal === deal.id && (
                <div className="mt-3 border-t border-gray-100 pt-3" onClick={(e) => e.stopPropagation()}>
                  <label className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-3 py-3 cursor-pointer active:border-yellow-400 ${uploading ? "opacity-50" : ""}`}>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span className="text-xs text-gray-500">{uploading ? "Uploading\u2026" : "Select files"}</span>
                    <input type="file" multiple className="hidden" onChange={(e) => handleUpload(deal.id, e.target.files)} disabled={uploading} />
                  </label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <button onClick={() => setUploadTargetDeal(null)} className="text-xs text-gray-400">Cancel</button>
                    {uploadSuccess && <span className="text-xs text-green-600">Uploaded</span>}
                    {uploadError && <span className="text-xs text-red-600">{uploadError}</span>}
                  </div>
                </div>
              )}
    
              {lastAction[deal.id] && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                  <span className="text-green-600 text-sm mt-0.5">✓</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-green-700">
                      {lastAction[deal.id].type === "note" ? "Note added" : "Document uploaded"}
                    </p>
                    <p className="text-xs text-green-600 truncate">{lastAction[deal.id].text}</p>
                  </div>
                </div>
              )}
            </div>
    
          </div>
        );
      })}
    </div>
  );
}
