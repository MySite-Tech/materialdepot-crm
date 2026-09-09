'use client';

import { CityFilter } from '../../siteAuditShared';
import CatAnalyticsPanel from '../../ui/CatAnalyticsPanel';
import { CommercialTab } from '../../ui/CatAnalyticsPanel';
import { AN_TABS, AN_TAB_KEY } from '../../constants/analytics';
import { ExecutionAnalyticsView } from './execution';
import { useCallback, useEffect, useState } from 'react';

export default function SiteAuditAnalyticsView({ city = 'all', execOnly = false }: { city?: CityFilter; execOnly?: boolean } = {}) {
  const [tab, setTab] = useState<string>(() => {
    if (execOnly) return 'execution';
    try {
      const saved = localStorage.getItem(AN_TAB_KEY);
      if (saved && AN_TABS.some((t) => t.k === saved)) return saved;
    } catch {
      /* private mode / storage disabled — the default tab is fine */
    }
    return 'category';
  });

  const pick = useCallback(
    (k: string) => {
      if (execOnly && k !== 'execution') return;
      setTab(k);
      try {
        localStorage.setItem(AN_TAB_KEY, k);
      } catch {
        /* nothing to do — the choice just won't survive a reload */
      }
    },
    [execOnly]
  );

  useEffect(() => {
    if (execOnly && tab !== 'execution') setTab('execution');
  }, [execOnly, tab]);

  const tabs = execOnly ? AN_TABS.filter((t) => t.k === 'execution') : AN_TABS;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-black">Analytics</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          {execOnly
            ? 'Field-operations execution. Each tab keeps its own definitions visible — no number on this page is left unexplained.'
            : 'Category commercial performance and field-operations execution, in one place. Each tab keeps its own definitions visible — no number on this page is left unexplained.'}
        </p>
      </div>

      <div className="md-an">
        <div className="an-tabs">
          {tabs.map((t) => (
            <button key={t.k} className={`an-tab${t.k === tab ? ' active' : ''}`} onClick={() => pick(t.k)}>
              <span>
                {t.ico} {t.label}
                <small>{t.sub}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      {tab === 'execution' ? (
        <ExecutionAnalyticsView city={city} />
      ) : (
        <CatAnalyticsPanel tab={tab as CommercialTab} city={city} onTabChange={pick} />
      )}
    </div>
  );
}
