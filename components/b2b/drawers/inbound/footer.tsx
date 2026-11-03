'use client';

import { EnrichmentGap } from '../../types/inbound';
import { SaveState } from '../../types/inbound-drawer';
import { GateErrors } from '../../ui/inbound-chips';

export function InboundDrawerFooter({ gaps, gateErrors, handleSave, onClose, save, showGates, discard }: {
  gaps: EnrichmentGap[];
  gateErrors: string[];
  handleSave: () => Promise<void>;
  onClose: () => void;
  save: SaveState;
  showGates: boolean;
  discard: { keep: () => void; discard: () => void } | null;
}) {
  return (
    <div className="mt-auto sticky bottom-0 bg-white border-t border-gray-200 px-6 py-3.5 flex flex-col gap-2">
      {showGates && gateErrors.length > 0 && <GateErrors errors={gateErrors} />}
      {save.error && <GateErrors errors={[save.error]} />}
      {discard && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 flex items-center justify-between gap-3 flex-wrap">
          <span>Your changes to this lead are not saved yet.</span>
          <span className="flex gap-2">
            <button onClick={discard.keep} className="px-3 py-1 font-semibold rounded border border-amber-300 bg-white">Keep editing</button>
            <button onClick={discard.discard} className="px-3 py-1 font-semibold rounded border border-red-200 bg-white text-red-700">Discard changes</button>
          </span>
        </div>
      )}
      {save.warning && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 leading-snug">
          {save.warning}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <button onClick={onClose} className="px-4 py-2 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">
          Close
        </button>
        <div className="flex items-center gap-2">
          {gaps.length > 0 && (
            <span className="text-[10px] text-amber-700 hidden sm:inline">{gaps.length} field{gaps.length === 1 ? '' : 's'} still empty</span>
          )}
          <button
            onClick={() => handleSave()}
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
