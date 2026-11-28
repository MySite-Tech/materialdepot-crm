import { Pill } from '../../b2b/ui/inbound-chips';
import type { LeadStage, Priority } from '@/lib/bda-retail/types';

const STAGE: Record<LeadStage, { label: string; color: string }> = {
  new: { label: 'Not called', color: '#2563EB' },
  attempting: { label: 'Trying', color: '#D97706' },
  follow_up: { label: 'Follow-up', color: '#7C3AED' },
  closed: { label: 'Closed', color: '#6B7280' },
  unreachable: { label: 'Unreachable', color: '#DC2626' },
};

export const PRIORITY_COLOR: Record<Priority, string> = { P1: '#DC2626', P2: '#D97706', P3: '#2563EB' };

export function StageChip({ stage }: { stage: LeadStage }) {
  return <Pill color={STAGE[stage].color}>{STAGE[stage].label}</Pill>;
}

export function PriorityChip({ p }: { p: Priority }) {
  return <Pill color={PRIORITY_COLOR[p]}>{p}</Pill>;
}

export const labelCls = 'block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1';

export const selectCls = 'px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[120px]';

export function PageHead({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
      <div>
        <h1 className="text-[19px] font-bold text-gray-900">{title}</h1>
        <p className="text-[11.5px] text-gray-500 mt-0.5">{sub}</p>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function Notice({ tone, children, onClose }: { tone: 'red' | 'teal' | 'amber'; children: React.ReactNode; onClose?: () => void }) {
  const cls = { red: 'border-red-200 bg-red-50 text-red-700', teal: 'border-teal-100 bg-teal-50 text-teal-900', amber: 'border-amber-200 bg-amber-50 text-amber-900' }[tone];
  return (
    <div className={`mb-4 rounded-md border px-3 py-2 text-[12px] leading-snug flex items-start justify-between gap-3 ${cls}`}>
      <span>{children}</span>
      {onClose && <button onClick={onClose} className="opacity-60 hover:opacity-100 text-lg leading-none shrink-0">×</button>}
    </div>
  );
}
