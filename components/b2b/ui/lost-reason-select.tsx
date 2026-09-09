'use client';

export function LostReasonSelect({ value, options, onChange, className }: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  className?: string;
}) {
  const legacy = value && !options.includes(value) ? value : null;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">Select a reason…</option>
      {options.map((r) => <option key={r} value={r}>{r}</option>)}
      {legacy && <option value={legacy}>{legacy} (previously recorded)</option>}
    </select>
  );
}
