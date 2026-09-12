'use client';

import { OrgPerson, STAKEHOLDERS, StakeholderRole, stakeholderLabel } from '@/lib/org';

const TIER_STYLE: Record<string, string> = {
  Frontline: 'bg-blue-50 text-blue-600 border-blue-200',
  'Store leadership': 'bg-amber-50 text-amber-700 border-amber-200',
  'Above store': 'bg-gray-800 text-white border-gray-800',
};

export function RoleBadge({ role, crmRole }: { role: StakeholderRole | null; crmRole?: string }) {
  if (!role) {
    return (
      <span className="inline-flex items-center rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-gray-400">
        {crmRole ? crmRole.replace(/_/g, ' ') : '—'}
      </span>
    );
  }
  const s = STAKEHOLDERS[role];
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${TIER_STYLE[s.tier]}`} title={s.label}>
      {s.code}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-[12px] font-semibold text-gray-700">{children}</div>
    </div>
  );
}

export function ReportingLine({ me, reportCount, viewing, isSelf, onViewSelf }: {
  me: OrgPerson;
  reportCount: number;
  viewing: string;
  isSelf: boolean;
  onViewSelf: () => void;
}) {
  const role = me.stakeholder;
  const checker = role ? STAKEHOLDERS[role].reportsTo : null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <RoleBadge role={role} crmRole={me.crmRole} />
          <div>
            <div className="text-[13px] font-bold text-gray-900">{me.name || '—'}</div>
            <div className="text-[11px] text-gray-400">{stakeholderLabel(role)}</div>
          </div>
        </div>

        <Fact label="Checked by">
          {checker ? STAKEHOLDERS[checker].label : role === 'central' ? 'Top of the chain' : 'Not defined'}
        </Fact>
        <Fact label="Under you">
          {reportCount === 0 ? 'Nobody' : `${reportCount} ${reportCount === 1 ? 'person' : 'people'}`}
        </Fact>
        <Fact label="Now viewing">
          <span className={isSelf ? 'text-green-700' : 'text-gray-800'}>{viewing || '—'}</span>
          {!isSelf && (
            <button onClick={onViewSelf} className="ml-2 text-[11px] font-medium text-blue-600 hover:underline cursor-pointer">
              back to mine
            </button>
          )}
        </Fact>
      </div>
      {role && (
        <div className="mt-2.5 border-t border-gray-50 pt-2 text-[11px] text-gray-400">
          <span className="font-semibold text-gray-500">Owns:</span> {STAKEHOLDERS[role].owns} ·{' '}
          <span className="font-semibold text-gray-500">Reviewed:</span> {STAKEHOLDERS[role].reviewedOn}
        </div>
      )}
    </div>
  );
}
