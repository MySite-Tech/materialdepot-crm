'use client';

import { useState } from 'react';
import { CHECKLIST_VALUES } from '@/lib/store-checklist/constants';
import type { ChecklistItem, ChecklistMark, ChecklistValue } from '@/lib/store-checklist/types';

const VALUE_STYLES: Record<ChecklistValue, string> = {
  yes: 'bg-emerald-500 border-emerald-500 text-white',
  no: 'bg-red-500 border-red-500 text-white',
  na: 'bg-gray-400 border-gray-400 text-white',
};

const VALUE_LABELS: Record<ChecklistValue, string> = { yes: 'Yes', no: 'No', na: 'NA' };

export function ItemRow({ item, mark, unsaved, readOnly, onValue, onComment }: {
  item: ChecklistItem;
  mark: ChecklistMark | undefined;
  unsaved: boolean;
  readOnly: boolean;
  onValue: (v: ChecklistValue) => void;
  onComment: (text: string) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const comment = mark?.c ?? '';
  const showNote = !readOnly && (noteOpen || mark?.v === 'no' || comment.length > 0);
  const needsNote = mark?.v === 'no' && !comment.trim();

  return (
    <div className={`px-3.5 py-2.5 border-b border-gray-100 last:border-b-0 ${needsNote ? 'bg-amber-50/60' : ''}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <span className="flex-1 text-[13px] text-gray-700 leading-snug">
          {item.label}
          {unsaved && <span className="ml-1.5 text-[11px] font-semibold text-amber-600">•</span>}
        </span>

        {readOnly ? (
          <span className={`self-start sm:self-auto px-2 py-0.5 rounded text-[11.5px] font-semibold border ${mark?.v ? VALUE_STYLES[mark.v] : 'border-gray-200 text-gray-400'}`}>
            {mark?.v ? VALUE_LABELS[mark.v] : 'Not marked'}
          </span>
        ) : (
          <div className="flex gap-1.5 shrink-0">
            {CHECKLIST_VALUES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => onValue(value)}
                className={`px-3 py-1.5 rounded-md text-[12px] font-semibold border cursor-pointer transition-colors ${
                  mark?.v === value ? VALUE_STYLES[value] : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
            {!showNote && (
              <button
                type="button"
                onClick={() => setNoteOpen(true)}
                className="px-2 py-1.5 rounded-md text-[12px] font-semibold border border-dashed border-gray-200 bg-white text-gray-400 cursor-pointer hover:text-gray-600"
              >
                Note
              </button>
            )}
          </div>
        )}
      </div>

      {showNote && (
        <input
          type="text"
          value={comment}
          onChange={(e) => onComment(e.target.value)}
          placeholder={mark?.v === 'no' ? 'What is wrong, and who is fixing it?' : 'Comment (optional)'}
          disabled={!mark?.v}
          className="mt-2 w-full px-2.5 py-1.5 text-[12.5px] border border-gray-200 rounded-md outline-none focus:border-gray-300 disabled:bg-gray-50 disabled:text-gray-400"
        />
      )}

      {readOnly && comment && (
        <p className="mt-1.5 text-[12px] text-gray-500">{comment}</p>
      )}
    </div>
  );
}
