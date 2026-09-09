'use client';

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 pb-5 border-b border-gray-100 last:border-b-0">
      <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-gray-700 mb-2.5">{title}{subtitle ? <span className="font-medium normal-case tracking-normal text-gray-400"> {subtitle}</span> : null}</h3>
      {children}
    </div>
  );
}

export function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex text-[13px] py-1 gap-3">
      <span className="w-32 shrink-0 text-gray-400">{k}</span>
      <span className="text-gray-900 min-w-0">{v}</span>
    </div>
  );
}

export function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2.5">
      <label className="block text-[11px] font-semibold text-gray-500 mb-1">{label} <span className="text-[10px] font-bold text-green-700 bg-green-50 rounded px-1.5 py-0.5 ml-1">auto</span></label>
      <input value={value} disabled className="w-full px-2.5 py-2 border border-gray-200 rounded-md text-[13px] bg-gray-50 text-gray-500" />
    </div>
  );
}

export function FieldDate({ label, value, min, onChange }: { label: string; value: string; min: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-2.5">
      <label className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</label>
      <input type="date" min={min} value={value} onChange={(e) => onChange(e.target.value)} className="px-2.5 py-2 border border-gray-200 rounded-md text-[13.5px]" />
    </div>
  );
}
