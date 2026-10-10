'use client';

import { fetchMetabaseEmbedToken } from '@/lib/api';
import { createElement, useEffect, useState } from 'react';

export const METABASE_REPORTS = {
  storeRevenue: {
    label: 'Store Revenue',
    title: 'Revenue Tracker — Store-wise (revenue excl. GST, excl. other ply + Special)',
    questionId: 2978,
    url: 'https://metabase.materialdepot.in/question/2978-revenue-tracker-store-wise-revenue-excl-gst-excl-other-ply-special?order_date=2026-10-01~2026-10-31&store=&sort_by=Incentive%20revenue%20excl.%20GST&sort_dir=Descending',
  },
  bmRevenue: {
    label: 'BM Revenue',
    title: 'ECA Revenue Tracker — BM-wise (revenue & eligible revenue excl. GST)',
    questionId: 2977,
    url: 'https://metabase.materialdepot.in/question/2977-eca-revenue-tracker-bm-wise-revenue-eligible-revenue-excl-gst?order_date=2026-10-01~2026-10-31&store=&bm=&sort_by=Revenue%20excl.%20GST&sort_dir=Descending',
  },
} as const;

export type MetabaseReportKey = keyof typeof METABASE_REPORTS;

declare global {
  interface Window { metabaseConfig?: Record<string, unknown> }
}

type MetabaseTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'metabase-embed-theme';

function readStoredTheme(): MetabaseTheme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function loadEmbedScript(instanceUrl: string, theme: MetabaseTheme) {
  if (document.querySelector('script[data-metabase-embed]')) return;
  window.metabaseConfig = { theme: { preset: theme }, isGuest: true, instanceUrl };
  const s = document.createElement('script');
  s.src = `${instanceUrl}/app/embed.js`;
  s.defer = true;
  s.dataset.metabaseEmbed = 'true';
  document.head.appendChild(s);
}

export default function MetabaseReport({ report }: { report: MetabaseReportKey }) {
  const { title, url, questionId } = METABASE_REPORTS[report];
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [theme, setTheme] = useState<MetabaseTheme>(readStoredTheme);

  const changeTheme = (next: MetabaseTheme) => {
    setTheme(next);
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch {}
    if (document.querySelector('script[data-metabase-embed]')) window.metabaseConfig = { theme: { preset: next } };
  };

  useEffect(() => {
    setToken(null);
    setError(false);
    fetchMetabaseEmbedToken(questionId)
      .then(({ token, instanceUrl }) => {
        loadEmbedScript(instanceUrl, readStoredTheme());
        setToken(token);
      })
      .catch(() => setError(true));
  }, [questionId]);

  return (
    <div className="px-3 sm:px-6 py-4 sm:py-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-semibold text-gray-800">{title}</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-full border border-gray-300 bg-white p-0.5">
            {(['light', 'dark'] as const).map(t => (
              <button
                key={t}
                onClick={() => changeTheme(t)}
                className={`px-3 py-1 rounded-full text-[12px] font-semibold capitalize cursor-pointer transition-all ${theme === t ? 'bg-[#1A1A1A] text-white' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {t}
              </button>
            ))}
          </div>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-blue-600 hover:underline">Open in Metabase</a>
        </div>
      </div>
      <div className={`w-full min-h-[600px] border rounded-xl overflow-hidden ${theme === 'dark' ? 'bg-[#1F2937] border-gray-700' : 'bg-white border-gray-200'}`}>
        {error ? (
          <div className="p-6 text-[13px] text-red-600">Couldn&apos;t load this report. Use “Open in Metabase” instead.</div>
        ) : token ? (
          createElement('metabase-question', { key: token, token, 'with-title': 'false', 'with-downloads': 'true' })
        ) : (
          <div className="p-6 text-[13px] text-gray-400">Loading…</div>
        )}
      </div>
    </div>
  );
}
