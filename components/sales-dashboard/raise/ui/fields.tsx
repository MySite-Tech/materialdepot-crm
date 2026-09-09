'use client';

import { useState } from 'react';

export function RaiseField({
  label,
  options,
  onSubmit,
  submitting,
}: {
  label: string;
  options: { id: number; name: string; label?: string; requestType?: "Support" | "Escalation" }[];
  onSubmit: (opts: { id: number; name: string; requestType?: "Support" | "Escalation" }[]) => void;
  submitting: boolean;
}) {

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const selectedOption = selectedIdx === null ? null : options[selectedIdx];
  const isPending = selectedOption?.id === 0;

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {options.map((o, i) => (
          <button
            key={`${o.id}-${i}`}
            type="button"
            disabled={submitting}
            onClick={() => setSelectedIdx(selectedIdx === i ? null : i)}
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
      {selectedOption && (
        <button
          onClick={() => { if (!isPending) onSubmit([selectedOption]); }}
          disabled={submitting || isPending}
          className="w-full py-2 rounded-lg bg-yellow-400 text-gray-950 text-sm font-bold disabled:opacity-50"
        >
          {isPending ? "Pending Kylas ID" : submitting ? "Submitting…" : "Submit"}
        </button>
      )}
    </div>
  );
}
