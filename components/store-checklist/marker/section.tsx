'use client';

import { useState } from 'react';
import type { ChecklistMark, ChecklistSection, ChecklistValue, SectionProgress } from '@/lib/store-checklist/types';
import { ItemRow } from './item-row';

export function SectionCard({ section, progress, markOf, isUnsaved, readOnly, onValue, onComment, onMarkRemainingYes }: {
  section: ChecklistSection;
  progress: SectionProgress;
  markOf: (itemId: string) => ChecklistMark | undefined;
  isUnsaved: (itemId: string) => boolean;
  readOnly: boolean;
  onValue: (itemId: string, v: ChecklistValue) => void;
  onComment: (itemId: string, text: string) => void;
  onMarkRemainingYes: (itemIds: string[]) => void;
}) {
  const [open, setOpen] = useState(true);
  const remaining = section.items.filter((i) => !markOf(i.id)?.v).map((i) => i.id);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-3.5 py-2.5 bg-gray-50 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 flex-1 text-left bg-transparent cursor-pointer"
        >
          <span className={`text-[10px] text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
          <span className="text-[13px] font-bold text-gray-800">{section.label}</span>
          <span className="text-[11px] text-gray-400">{section.when}</span>
        </button>

        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold tabular-nums ${
          progress.complete ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
        }`}>
          {progress.answered}/{progress.total}
        </span>
        {progress.no > 0 && (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-600">
            {progress.no}{' '}No
          </span>
        )}
        {!readOnly && remaining.length > 0 && (
          <button
            type="button"
            onClick={() => onMarkRemainingYes(remaining)}
            className="px-2 py-1 rounded border border-gray-200 bg-white text-[11.5px] font-semibold text-gray-600 cursor-pointer hover:border-gray-300 whitespace-nowrap"
          >
            Rest Yes
          </button>
        )}
      </div>

      {open && (
        <div>
          {section.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              mark={markOf(item.id)}
              unsaved={isUnsaved(item.id)}
              readOnly={readOnly}
              onValue={(v) => onValue(item.id, v)}
              onComment={(text) => onComment(item.id, text)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
