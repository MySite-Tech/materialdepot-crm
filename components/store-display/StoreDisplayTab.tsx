'use client';
import { useState, useMemo } from 'react';
import { StoreProducts } from './StoreProducts';
import { MovementStatusView } from './MovementStatusView';
import { AdminView } from './AdminView';
import { DiscontinuedList } from './DiscontinuedList';
import { RemovedList } from './RemovedList';

const ALL_SUB_TABS = [
  { key: 'products', label: 'Store Products', restricted: false },
  // { key: 'liveMapping', label: 'Live Mapping', restricted: true },
  { key: 'discontinued', label: 'Discontinued List', restricted: false },
  { key: 'removed', label: 'Removed', restricted: false },
  { key: 'movements', label: 'Movement Status', restricted: true },
  { key: 'admin', label: 'Admin', restricted: true },
] as const;

type SubTab = (typeof ALL_SUB_TABS)[number]['key'];

/* `isAdmin` is resolved from the caller's permission slug, not their
   permission_name — see canAdminStoreDisplay in app/App.tsx. */
export default function StoreDisplayTab({ isAdmin }: { isAdmin: boolean }) {
  const [subTab, setSubTab] = useState<SubTab>('products');

  const visibleTabs = useMemo(
    () => ALL_SUB_TABS.filter(t => !t.restricted || isAdmin),
    [isAdmin],
  );

  return (
    <div className="flex flex-col">
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 flex gap-0">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`px-5 py-3 text-[13px] font-semibold border-b-2 cursor-pointer bg-transparent ${
                subTab === t.key
                  ? 'border-[#EAB308] text-gray-800'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'products' && <StoreProducts />}
      {subTab === 'discontinued' && <DiscontinuedList />}
      {subTab === 'removed' && <RemovedList />}
      {subTab === 'movements' && <MovementStatusView />}
      {subTab === 'admin' && <AdminView />}
    </div>
  );
}
