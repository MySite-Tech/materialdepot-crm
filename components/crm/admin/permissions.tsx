'use client';

import { Branch } from '../../../types/crm';
import { PERMISSION_TAB_ORDER, ROLE_OPTIONS, SITE_AUDIT_SUBROLES, SITE_AUDIT_SUBROLE_SLUGS, STORE_DISPLAY_ADMIN_SLUG, TAB_LABELS } from '../constants';
import { roleLabel } from '../utils';
import { Fragment, useEffect, useRef, useState } from 'react';

export function RoleSelect({ value, onChange, className }: { value: string; onChange: (role: string) => void; className: string }) {
  const options = ROLE_OPTIONS.includes(value) || !value ? ROLE_OPTIONS : [value, ...ROLE_OPTIONS];
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((r) => (
        <option key={r} value={r}>{roleLabel(r)}</option>
      ))}
    </select>
  );
}

function CheckboxDropdown({ label, summary, children, hideLabel }: { label: string; summary: string; children: React.ReactNode; hideLabel?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {!hideLabel && <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 whitespace-nowrap">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none bg-white w-full text-left flex items-center justify-between gap-2 cursor-pointer hover:border-gray-300"
      >
        <span className="truncate text-gray-700">{summary}</span>
        <span className={`text-gray-400 text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-[320px] max-h-[360px] overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg p-3">
          {children}
        </div>
      )}
    </div>
  );
}

function CheckboxRow({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-[12.5px] text-gray-600 py-1">
      <input type="checkbox" className="accent-[#EAB308]" checked={checked} onChange={onChange} />
      {children}
    </label>
  );
}

export function PermissionChecklist({ value, onChange, hideLabel }: { value: string[]; onChange: (next: string[]) => void; hideLabel?: boolean }) {
  const toggle = (slug: string) => onChange(value.includes(slug) ? value.filter((s) => s !== slug) : [...value, slug]);

  const hasAnySubRole = value.some((s) => SITE_AUDIT_SUBROLE_SLUGS.has(s));
  const selectSubRole = (slug: string) => {
    const withoutSubRoles = value.filter((s) => !SITE_AUDIT_SUBROLE_SLUGS.has(s));
    onChange(slug ? [...withoutSubRoles, slug] : withoutSubRoles);
  };
  const hasSiteAudit = value.includes('crm.site_audit');
  const hasStoreDisplay = value.includes('crm.store_display');

  const hasStoreDisplayFull = value.includes(STORE_DISPLAY_ADMIN_SLUG);

  const toggleStoreDisplay = () => onChange(
    hasStoreDisplay
      ? value.filter((s) => s !== 'crm.store_display' && s !== STORE_DISPLAY_ADMIN_SLUG)
      : [...value, 'crm.store_display'],
  );
  const setStoreDisplayFull = (full: boolean) => onChange(
    full
      ? (hasStoreDisplayFull ? value : [...value, STORE_DISPLAY_ADMIN_SLUG])
      : value.filter((s) => s !== STORE_DISPLAY_ADMIN_SLUG),
  );
  const summary = value.length === 0 ? 'None (role-based tabs)' : `${value.length} permission${value.length === 1 ? '' : 's'} set`;
  return (
    <CheckboxDropdown label="CRM Permissions" summary={summary} hideLabel={hideLabel}>
      <p className="text-[10.5px] text-gray-400 mb-2 pb-2 border-b border-gray-100">Optional — overrides role-based tabs once any are set.</p>
      {PERMISSION_TAB_ORDER.map(([slug, tab]) => (
        <Fragment key={slug}>
          <CheckboxRow
            checked={value.includes(slug)}
            onChange={() => (slug === 'crm.store_display' ? toggleStoreDisplay() : toggle(slug))}
          >
            {TAB_LABELS[tab]}
          </CheckboxRow>
          {slug === 'crm.store_display' && hasStoreDisplay && (
            <div className="my-1.5 py-1.5 border-y border-gray-100 pl-3 border-l-2 border-l-amber-200">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Store Display access (pick one)</span>
              {([[false, 'Partial — without Admin section'], [true, 'Full — including Admin section']] as const).map(([full, label]) => (
                <label key={label} className="flex items-center gap-2 cursor-pointer text-[12.5px] text-gray-600 py-1">
                  <input type="radio" name="store-display-level" className="accent-[#EAB308]" checked={hasStoreDisplayFull === full} onChange={() => setStoreDisplayFull(full)} />
                  {label}
                </label>
              ))}
            </div>
          )}
          {slug === 'crm.site_audit' && hasSiteAudit && (
            <div className="my-1.5 py-1.5 border-y border-gray-100 pl-3 border-l-2 border-l-amber-200">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Site Audit view (pick one)</span>
              {SITE_AUDIT_SUBROLES.map(([subSlug, label]) => (
                <label key={subSlug} className="flex items-center gap-2 cursor-pointer text-[12.5px] text-gray-600 py-1">
                  <input type="radio" name="site-audit-subrole" className="accent-[#EAB308]" checked={subSlug ? value.includes(subSlug) : !hasAnySubRole} onChange={() => selectSubRole(subSlug)} />
                  {label}
                </label>
              ))}
            </div>
          )}
        </Fragment>
      ))}
    </CheckboxDropdown>
  );
}

export function BranchAccessDropdown({ branchList, value, onChange, hideLabel }: { branchList: Branch[]; value: string[]; onChange: (next: string[]) => void; hideLabel?: boolean }) {
  const toggle = (name: string) => onChange(value.includes(name) ? value.filter((s) => s !== name) : [...value, name]);
  const summary = value.length === 0 ? 'All branches' : value.join(', ');
  return (
    <CheckboxDropdown label="Branch Access" summary={summary} hideLabel={hideLabel}>
      {branchList.map((b) => (
        <CheckboxRow key={b.id} checked={value.includes(b.name)} onChange={() => toggle(b.name)}>
          {b.name}
        </CheckboxRow>
      ))}
    </CheckboxDropdown>
  );
}
