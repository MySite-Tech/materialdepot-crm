'use client';

import { STATUS_COLORS } from '../constants/crm';
import { AvatarProps, EditableStatusProps, ThProps } from '../types/crm';

export function Avatar({ name, size = 24 }: AvatarProps) {
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  return (
    <div className="bg-[#EAB308] text-white rounded-full inline-flex items-center justify-center font-semibold shrink-0" style={{ width: size, height: size, fontSize: size * 0.45, lineHeight: size + 'px' }}>
      {initial}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || '#9CA3AF';
  return (
    <span className="inline-block px-2 py-0.5 rounded-xl text-[11px] font-semibold border whitespace-nowrap" style={{ background: color + '18', color, borderColor: color + '40' }}>
      {status}
    </span>
  );
}

export function EditableStatus({ status, lostReason }: EditableStatusProps) {
  return (
    <span>
      <StatusBadge status={status} />
      {status === 'Order Lost' && lostReason && <div className="text-[10px] text-gray-400 mt-0.5">{lostReason}</div>}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

export function Th({ label, sortKey, sortCol, sortDir, onSort, className: extraClass }: ThProps) {
  const active = sortCol === sortKey;
  return (
    <th
      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none ${sortKey ? 'cursor-pointer' : 'cursor-default'} ${extraClass || ''}`}
      onClick={() => sortKey && onSort(sortKey)}
    >
      {label}
      {sortKey && (
        <span className={`ml-1 ${active ? 'opacity-100' : 'opacity-30'}`}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇕'}
        </span>
      )}
    </th>
  );
}
