'use client';

import { KAMS, fmtINR } from '../../models/mockData';
import { ExportButton, ExportFormat, ExportScope, exportRowsCsv, exportRowsExcel, todayStr } from '../../ui/exportUtils';
import { Empty, LeadName, Spinner, inputCls } from '../../ui/inboundChips';
import { ExpectedClosureCell, SourceChip, UnifiedStatusCell } from './cells';
import { EXPORT_HEADERS, PAGE_SIZE } from '../../constants/leads-tab';
import { DetailDrawer } from './drawer';
import { toExportRow } from '../../utils/leads-tab';
import { LeadSource, UnifiedLead, UnifiedStatus, fetchUnifiedLeads } from '@/lib/b2bLeads';
import { useEffect, useMemo, useState } from 'react';

export default function LeadsTab() {
  const [leads, setLeads] = useState<UnifiedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<LeadSource[]>([]);
  const [inboundTotal, setInboundTotal] = useState(0);
  const [inboundHasMore, setInboundHasMore] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [source, setSource] = useState<'all' | LeadSource>('all');
  const [status, setStatus] = useState<'all' | UnifiedStatus>('all');
  const [lostOnly, setLostOnly] = useState(false);
  const [hideLost, setHideLost] = useState(false);
  const [kam, setKam] = useState('all');
  const [search, setSearch] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [page, setPage] = useState(0);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchUnifiedLeads({ createdFrom, createdTo })
      .then((res) => {
        setLeads(res.leads);
        setFailed(res.failed);
        setInboundTotal(res.inboundTotal);
        setInboundHasMore(res.inboundHasMore);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load leads'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [createdFrom, createdTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (source !== 'all' && l.source !== source) return false;
      if (status !== 'all' && l.status !== status) return false;
      if (lostOnly && !l.lost) return false;
      if (hideLost && l.lost) return false;
      if (kam !== 'all' && l.kam !== kam) return false;
      if (q) {
        const hay = [l.companyName, l.contactPerson, l.phone, l.enqId, l.spok, l.kam]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, source, status, lostOnly, hideLost, kam, search]);

  useEffect(() => { setPage(0); }, [filtered.length]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const counts = useMemo(() => ({
    total: filtered.length,
    closed: filtered.filter((l) => l.status === 'Closed').length,
    lost: filtered.filter((l) => l.lost).length,
    withEnq: filtered.filter((l) => !!l.enqId).length,
    value: filtered.reduce((a, l) => a + (Number(l.orderValue) || 0), 0),
  }), [filtered]);

  const handleExport = async (format: ExportFormat, scope: ExportScope) => {
    if (exporting) return;
    const list = scope === 'all' ? leads : filtered;
    if (!list.length) { setError('No leads matched — nothing to export.'); return; }
    setExporting(true);
    try {
      const name = `b2b_leads_${scope}_${todayStr()}`;
      const data = list.map(toExportRow);
      if (format === 'csv') exportRowsCsv(EXPORT_HEADERS, data, name);
      else await exportRowsExcel(EXPORT_HEADERS, data, name, 'Leads');
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setSource('all'); setStatus('all'); setLostOnly(false); setHideLost(false);
    setKam('all'); setSearch(''); setCreatedFrom(''); setCreatedTo('');
  };
  const activeFilters = [
    source !== 'all', status !== 'all', lostOnly, hideLost, kam !== 'all',
    !!search.trim(), !!createdFrom, !!createdTo,
  ].filter(Boolean).length;

  const selected = leads.find((l) => l.key === selectedKey) || null;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-[19px] font-bold text-gray-900">Leads</h1>
          <p className="text-[11.5px] text-gray-500 mt-0.5">
            Every lead across Inbound and Outreach
            {loading ? ' · loading…' : ` · ${filtered.length} shown`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton onExport={handleExport} disabled={exporting} />
          <button
            onClick={load}
            disabled={loading}
            className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap disabled:opacity-50"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {failed.length > 0 && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 leading-snug">
          The <strong>{failed.join(' and ')}</strong> {failed.length === 1 ? 'side' : 'sides'} did not load, so this
          list is incomplete — it is not a CRM with no {failed.join('/')} leads. Refresh to try again.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 flex items-start justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700 text-lg leading-none shrink-0">×</button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-3 mb-4">
        <div className="flex items-end gap-2.5 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Company, contact, phone, Enquiry ID, KAM…"
              className={inputCls}
            />
          </div>
          {([
            ['Source', 'Both sources', source, setSource, ['all', 'Inbound', 'Outreach']],
            ['Status', 'All statuses', status, setStatus, ['all', 'Closed', 'Yet to Close']],
            ['KAM', 'All KAMs', kam, setKam, ['all', ...KAMS]],
          ] as const).map(([label, allLabel, val, setter, opts]) => (
            <div key={label}>
              <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</label>
              <select
                value={val as string}
                onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[130px]"
              >
                {opts.map((o) => <option key={o} value={o}>{o === 'all' ? allLabel : o}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Created from</label>
            <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)}
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white" />
          </div>
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">to</label>
            <input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)}
              className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white" />
          </div>
          <button
            onClick={() => { setLostOnly((v) => !v); setHideLost(false); }}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border whitespace-nowrap ${
              lostOnly ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-500 border-gray-200 hover:border-red-400'
            }`}
          >
            Lost only
          </button>
          <button
            onClick={() => { setHideLost((v) => !v); setLostOnly(false); }}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border whitespace-nowrap ${
              hideLost ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            }`}
          >
            Hide lost
          </button>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="px-3 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white text-gray-500 whitespace-nowrap">
              Clear {activeFilters}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 py-16"><Spinner label="Loading leads from both modules…" /></div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-baseline gap-3 px-4 py-2.5 border-b border-gray-100 flex-wrap">
            <span className="text-[11.5px] text-gray-600"><strong>{counts.total}</strong> leads</span>
            <span className="text-[11.5px] text-gray-500">{counts.closed} closed</span>
            <span className="text-[11.5px] text-gray-500">{counts.lost} lost</span>
            <span className="text-[11.5px] text-gray-500">{counts.withEnq} with an Enquiry ID</span>
            <span className="text-[11.5px] text-gray-700 font-mono">{fmtINR(counts.value)} order value</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {['Company Name', 'GST', 'Contact Number', 'Enquiry ID', 'Order Value',
                    'Expected Closure', 'KAM', 'Source', 'Spok', 'Status'].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.key} onClick={() => setSelectedKey(l.key)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                    <td className="px-3 py-2 font-semibold text-gray-900 max-w-[220px] truncate">
                      {l.companyName || <LeadName lead={{ company: l.inbound?.company, phone: l.phone }} />}
                    </td>
                    <td className="px-3 py-2 text-gray-500 font-mono whitespace-nowrap">{l.gstNumber || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-gray-500 font-mono whitespace-nowrap">{l.phone || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-gray-600 font-mono whitespace-nowrap">{l.enqId || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">
                      {l.orderValue ? fmtINR(l.orderValue) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap"><ExpectedClosureCell lead={l} /></td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.kam || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2"><SourceChip s={l.source} /></td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{l.spok || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2"><UnifiedStatusCell lead={l} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <Empty>No leads match these filters.</Empty>}
          <div className="flex items-center justify-between px-3 py-3 border-t border-gray-100 gap-3 flex-wrap">
            <span className="text-[11px] text-gray-400">
              Page {page + 1} of {pages} · {filtered.length} shown
              {inboundHasMore && inboundTotal > 0 && (
                <span> · {inboundTotal} unactioned inbound leads sit in Kylas; open the Inbound tab to page through them.</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">← Prev</button>
              <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}
                className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">Next →</button>
            </div>
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-400 mt-3 leading-snug">
        Status is the PRD&apos;s binary Closed / Yet to Close. Lost leads stay listed, marked Lost — filter
        them in or out above. <strong>Expected Closure</strong> reads <em>n/a</em> for Inbound leads because
        the Inbound module has no such field, which is different from a date nobody entered.
      </p>

      {selected && (
        <DetailDrawer
          lead={selected}
          onClose={() => setSelectedKey(null)}
          onSaved={(updated) => setLeads((prev) => prev.map((l) => (l.key === updated.key ? updated : l)))}
        />
      )}
    </div>
  );
}
