'use client';
import { useState, useMemo } from 'react';
import { StoreProducts } from './StoreProducts';
// import { LiveMappingView } from './LiveMappingView';
import { MovementStatusView } from './MovementStatusView';
import { AdminView } from './AdminView';
import { DiscontinuedList } from './DiscontinuedList';

const ADMIN_ROLES = ['superadmin', 'admin', 'tech', 'manager'];

const ALL_SUB_TABS = [
  { key: 'products', label: 'Store Products', restricted: false },
  // { key: 'liveMapping', label: 'Live Mapping', restricted: true },
  { key: 'discontinued', label: 'Discontinued List', restricted: false },
  { key: 'movements', label: 'Movement Status', restricted: true },
  { key: 'admin', label: 'Admin', restricted: true },
] as const;

type SubTab = (typeof ALL_SUB_TABS)[number]['key'];

export default function StoreDisplayTab({ userRole }: { userRole: string }) {
  const [subTab, setSubTab] = useState<SubTab>('products');

  const visibleTabs = useMemo(() => {
    const isAdmin = ADMIN_ROLES.includes(userRole);
    return ALL_SUB_TABS.filter(t => !t.restricted || isAdmin);
  }, [userRole]);

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
      {/* {subTab === 'liveMapping' && <LiveMappingView />} */}
      {subTab === 'movements' && <MovementStatusView />}
      {subTab === 'admin' && <AdminView />}
    </div>
  );
}
