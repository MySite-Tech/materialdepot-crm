'use client';

import { OutreachMeeting } from '../../models/mock-data';
import { SaveState } from '../../types/inbound-drawer';

export function OutreachFooter({ handleSave, meetings, met, onClose, save }: {
  handleSave: () => Promise<void>;
  meetings: OutreachMeeting[];
  met: boolean;
  onClose: () => void;
  save: SaveState;
}) {
  return (
    <div className="mt-auto sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4">
      {save.error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{save.error}</div>
      )}
      {save.warning && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{save.warning}</div>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-gray-400">
          {met ? `${meetings.filter((m) => m.status === 'Completed').length} meeting(s) held` : 'No meeting held yet'}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="px-4 py-2 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">Close</button>
          <button
            onClick={handleSave}
            disabled={save.saving}
            className="px-4 py-2 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-50"
          >
            {save.saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
