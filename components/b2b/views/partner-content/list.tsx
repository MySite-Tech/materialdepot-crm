'use client';

import { btnGhost } from '../../constants/ui';
import {
  STATE_CLASS, STATE_LABEL, STATE_PENDING, bannerState, launchState,
  type ContentState, type PartnerBanner, type PartnerLaunch,
} from '@/lib/b2b/content';

function StateChip({ state, dirty }: { state: ContentState; dirty: boolean }) {
  if (dirty) {
    return (
      <span className="px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 text-[10px] font-semibold">
        {STATE_PENDING[state]}
      </span>
    );
  }
  return (
    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${STATE_CLASS[state]}`}>
      {STATE_LABEL[state]}
    </span>
  );
}

function Thumb({ url }: { url: string | null }) {
  return (
    <div className="w-16 h-12 shrink-0 rounded border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
      {url
        ? <img src={url} alt="" className="w-full h-full object-cover" />
        : <span className="text-[9px] text-gray-400">No image</span>}
    </div>
  );
}

function Shell({
  children, onEdit, onRemove,
}: {
  children: React.ReactNode;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="p-3 bg-white border border-gray-200 rounded-lg flex items-start gap-3">
      {children}
      <div className="flex flex-col gap-1.5 shrink-0">
        <button className={btnGhost} onClick={onEdit}>Edit</button>
        <button className={`${btnGhost} text-red-600`} onClick={onRemove}>Remove</button>
      </div>
    </div>
  );
}

export function BannerRow({
  row, dirty, onEdit, onRemove,
}: {
  row: PartnerBanner;
  dirty: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const window = [row.starts_on, row.ends_on].filter(Boolean).join(' → ') || 'No dates set';
  return (
    <Shell onEdit={onEdit} onRemove={onRemove}>
      <Thumb url={row.image_url} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-gray-800 truncate">{row.title || 'Untitled'}</span>
          <StateChip state={bannerState(row)} dirty={dirty} />
        </div>
        {row.body && <p className="mt-0.5 text-[11px] text-gray-500 line-clamp-2">{row.body}</p>}
        <p className="mt-1 text-[10px] text-gray-400">
          {window} · order {row.priority}
          {row.cta_href ? ` · links to ${row.cta_href}` : ' · no button'}
        </p>
      </div>
    </Shell>
  );
}

export function LaunchRow({
  row, dirty, onEdit, onRemove,
}: {
  row: PartnerLaunch;
  dirty: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <Shell onEdit={onEdit} onRemove={onRemove}>
      <Thumb url={row.image_url} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-gray-800 truncate">{row.title || 'Untitled'}</span>
          <StateChip state={launchState(row)} dirty={dirty} />
          {row.is_featured && (
            <span className="px-1.5 py-0.5 rounded border border-[#0F766E] text-[#0F766E] text-[10px] font-semibold">
              Featured
            </span>
          )}
        </div>
        {row.subtitle && <p className="mt-0.5 text-[11px] text-gray-500 truncate">{row.subtitle}</p>}
        <p className="mt-1 text-[10px] text-gray-400">
          {row.kind}
          {row.category ? ` · ${row.category}` : ''}
          {row.launched_on ? ` · ${row.launched_on}` : ''}
          {row.ends_on ? ` → ${row.ends_on}` : ''}
          {` · order ${row.priority}`}
        </p>
      </div>
    </Shell>
  );
}
