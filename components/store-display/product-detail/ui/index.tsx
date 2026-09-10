'use client';

export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

export function StepLadder<T extends string>({ steps, currentIdx }: { steps: { key: T; label: string }[]; currentIdx: number }) {
  return (
    <div className="flex items-center gap-1 mb-3">
      {steps.map((step, i) => {
        const isComplete = i <= currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <div key={step.key} className="flex items-center gap-1 flex-1">
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${isComplete ? (isCurrent ? 'bg-amber-400 text-white' : 'bg-green-500 text-white') : 'bg-gray-200 text-gray-400'}`}>
                {isComplete ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] text-center leading-tight ${isComplete ? 'font-medium text-gray-700' : 'text-gray-400'}`}>{step.label}</span>
            </div>
            {i < steps.length - 1 && <div className={`h-0.5 w-4 ${i < currentIdx ? 'bg-green-500' : 'bg-gray-200'}`} />}
          </div>
        );
      })}
    </div>
  );
}
