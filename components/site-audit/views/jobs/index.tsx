'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchSiteAuditECs } from '@/lib/api';
import { inCity, sbGet, JOB_STATUS, type CityFilter } from '../../shared';
import { autoImportSiteAuditJobs } from '../../data/auto-import-audit-orders';
import { MD_CATEGORIES } from '../../data/audit-registry';
import { JobChip, JobDetailModal } from './job-detail';
import { JOB_CATEGORIES, catLabel, downloadJobsCsv, ecName, installBooking, jobLeadKey, skuCategories, slotText, whenText } from './utils';
import type { EcState, Job } from './types';

export { JobDetailModal } from './job-detail';

const JOBS_PAGE_SIZE = 25;

const FILTER_KEYS = ['all', 'audit', 'install', 'pending', 'assigned', 'scheduled', 'onway', 'atsite', 'completed', 'reschedule'];

export default function SiteAuditJobsView({ city = 'all' }: { city?: CityFilter } = {}) {
  const [loading, setLoading] = useState(true);
  const [realJobs, setRealJobs] = useState<Job[]>([]);
  const [jobsFilter, setJobsFilter] = useState('all');
  const [jobsDateFrom, setJobsDateFrom] = useState('');
  const [jobsDateTo, setJobsDateTo] = useState('');
  const [jobsSearch, setJobsSearch] = useState('');
  const [jobsCat, setJobsCat] = useState('');
  const [ec, setEc] = useState<EcState>({ status: 'loading', byLead: {} });
  const [selectedJob, setSelectedJob] = useState<{ pi: string; type: 'audit' | 'install' } | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    const nameMap: Record<string, string> = {};
    async function load() {
      const [auditRes, installRes, profileRes] = await Promise.all([
        sbGet('audit_orders?select=pi,customer_name,auditor_name,auditor_email,status,date,slot,city,service&status=not.in.(deleted,slot_reserved,slot_converted)&order=created_at.desc'),
        sbGet('install_orders_slim?select=pi,customer_name,skus,subjobs,status,delivery_date,city&status=neq.deleted&order=created_at.desc'),

        sbGet('profiles?select=name,email&role=neq.admin'),
      ]);
      if (!alive) return;
      if (Array.isArray(profileRes)) profileRes.forEach((p: any) => { nameMap[p.email] = p.name; });
      const jobs: Job[] = [];

      if (Array.isArray(auditRes)) {
        auditRes.forEach((r: any) => jobs.push({
          id: r.pi || '—', type: 'audit',
          customer: r.customer_name || '—', leadKey: jobLeadKey(r.pi),
          assignee: r.auditor_name || (r.auditor_email ? nameMap[r.auditor_email] : null),
          status: r.status || 'pending', date: r.date || null, slot: slotText([r.slot]), booked: !!r.date, city: r.city ?? null,
          cats: Object.entries(r.service || {}).filter(([k, v]) => MD_CATEGORIES[k] && Array.isArray(v) && v.length)
            .map(([k]) => ({ id: k, label: catLabel(k), installer: null })),
        }));
      }
      if (Array.isArray(installRes)) {
        installRes.forEach((r: any) => {
          const emails = [...new Set((r.subjobs || []).flatMap((sj: any) => {
            if (sj.assignments && sj.assignments.length) return sj.assignments.map((a: any) => a.installer_email).filter(Boolean);
            return sj.installer_email ? [sj.installer_email] : [];
          }))] as string[];
          const booking = installBooking(r.subjobs || []);
          jobs.push({
            id: r.pi || '—', type: 'install',
            customer: r.customer_name || '—', leadKey: jobLeadKey(r.pi),
            assignee: emails.length ? emails.map((e) => nameMap[e] || e.split('@')[0]).join(', ') : null,
            status: r.status || 'pending', date: booking.date || r.delivery_date || null, slot: booking.slot, booked: !!booking.date,
            installDates: booking.dates, city: r.city ?? null,
            cats: !(r.subjobs || []).length ? skuCategories(r.skus) : (r.subjobs || []).flatMap((sj: any) => {
              const label = catLabel(sj.type);
              const em = sj.assignments && sj.assignments.length
                ? [...new Set(sj.assignments.map((a: any) => a.installer_email).filter(Boolean))] as string[]
                : (sj.installer_email ? [sj.installer_email] : []);
              return em.length ? em.map((e) => ({ id: sj.type, label, installer: nameMap[e] || e.split('@')[0] })) : [{ id: sj.type, label, installer: null }];
            }),
          });
        });
      }
      setRealJobs(jobs);
      setLoading(false);
    }
    setLoading(true);

    autoImportSiteAuditJobs().then((added) => { if (added && alive) load(); });
    load();
    const tid = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => { alive = false; clearInterval(tid); };
  }, []);

  const cityJobs = useMemo(() => inCity(realJobs, city), [realJobs, city]);

  const leadKeys = useMemo(() => [...new Set(realJobs.map((j) => j.leadKey).filter(Boolean))].sort().join(','), [realJobs]);
  useEffect(() => {
    if (!leadKeys) return;
    let alive = true;
    fetchSiteAuditECs(leadKeys.split(','))
      .then((byLead) => { if (alive) setEc({ status: 'ok', byLead }); })
      .catch(() => { if (alive) setEc({ status: 'error', byLead: {} }); });
    return () => { alive = false; };
  }, [leadKeys]);

  const jc = useMemo(() => {
    const c = { total: cityJobs.length, active: 0, done: 0, unassigned: 0 };
    cityJobs.forEach((j) => {
      if (['assigned', 'onway', 'atsite', 'scheduled'].includes(j.status)) c.active++;
      if (j.status === 'completed') c.done++;
      if (!j.assignee) c.unassigned++;
    });
    return c;
  }, [cityJobs]);

  const filtered = useMemo(() => cityJobs.filter((j) => {
    if (jobsFilter === 'audit') return j.type === 'audit';
    if (jobsFilter === 'install') return j.type === 'install';
    if (JOB_STATUS[jobsFilter]) return j.status === jobsFilter;
    return true;
  }).filter((j) => !jobsCat || j.cats.some((c) => c.id === jobsCat)).filter((j) => {
    if (!jobsDateFrom && !jobsDateTo) return true;
    const inRange = (d: string | null) => !!d && (!jobsDateFrom || d >= jobsDateFrom) && (!jobsDateTo || d <= jobsDateTo);
    if (j.type === 'audit') return inRange(j.date);
    return (j.installDates || []).some(inRange);
  }).filter((j) => {
    if (!jobsSearch) return true;
    const q = jobsSearch.toLowerCase();

    const dates = [j.date, ...(j.installDates || [])].filter(Boolean).join(' ');
    const hay = [j.id, j.customer, ecName(ec, j), j.assignee, ...j.cats.map((c) => c.label), JOB_STATUS[j.status]?.l || j.status, dates]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  }), [cityJobs, jobsFilter, jobsCat, jobsDateFrom, jobsDateTo, jobsSearch, ec]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / JOBS_PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((curPage - 1) * JOBS_PAGE_SIZE, curPage * JOBS_PAGE_SIZE);

  useEffect(() => { setPage(1); }, [jobsFilter, jobsCat, jobsDateFrom, jobsDateTo, jobsSearch]);

  if (loading) {
    return (
      <>
        <div className="mb-4"><h1 className="text-xl font-bold text-gray-900">Jobs Overview</h1><p className="text-[13px] text-gray-400 mt-0.5">All audit and installation jobs across your team.</p></div>
        <div className="flex items-center justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-4"><h1 className="text-xl font-bold text-gray-900">Jobs Overview</h1><p className="text-[13px] text-gray-400 mt-0.5">All audit and installation jobs across your team.</p></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total Jobs</p><p className="mt-1 font-mono text-[22px] font-bold text-black">{jc.total}</p></div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Active Now</p><p className="mt-1 font-mono text-[22px] font-bold text-black">{jc.active}</p></div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Completed</p><p className="mt-1 font-mono text-[22px] font-bold text-black">{jc.done}</p></div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Unassigned</p><p className="mt-1 font-mono text-[22px] font-bold text-black">{jc.unassigned}</p></div>
      </div>
      {!cityJobs.length ? (
        <div className="rounded-lg border border-gray-200 bg-white px-4 sm:px-6 py-4">
          <div className="text-center py-8">
            <div className="text-2xl mb-2">📋</div>
            <div className="text-[13px] text-gray-400">No jobs yet — orders will appear here once Service Managers start adding them.</div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
          <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 border-b border-gray-100">
            <div className="relative" style={{ maxWidth: 280, minWidth: 180, flexShrink: 0 }}>
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
              <input type="text" placeholder="Search Enquiry ID, customer, EC, assigned to, status, date…" value={jobsSearch} onChange={(e) => setJobsSearch(e.target.value)} className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-md outline-none focus:border-yellow-400" />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {FILTER_KEYS.map((f) => (
                <button
                  key={f}
                  className={jobsFilter === f
                    ? 'bg-[#1A1A1A] text-white px-3 py-1.5 rounded-full text-xs font-semibold'
                    : 'bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-xs font-semibold'}
                  onClick={() => setJobsFilter(f)}
                >
                  {f === 'all' ? 'All Jobs' : f === 'audit' ? 'Audit' : f === 'install' ? 'Install' : JOB_STATUS[f]?.l || f}
                </button>
              ))}
            </div>
            <select value={jobsCat} onChange={(e) => setJobsCat(e.target.value)} className={`border rounded-md px-2.5 py-1.5 text-[13px] font-semibold outline-none cursor-pointer bg-white ${jobsCat ? 'border-yellow-400 text-gray-900' : 'border-gray-200 text-gray-500'}`}>
              <option value="">All categories</option>
              {JOB_CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
            </select>
            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              <input
                type="date"
                value={jobsDateFrom}
                max={jobsDateTo || undefined}
                title="From scheduled date"
                onChange={(e) => setJobsDateFrom(e.target.value)}
                className={`border rounded-md px-2.5 py-1.5 text-[13px] font-semibold outline-none cursor-pointer bg-white ${jobsDateFrom ? 'border-yellow-400 text-gray-900' : 'border-gray-200 text-gray-400'}`}
              />
              <span className="text-[12px] text-gray-400">to</span>
              <input
                type="date"
                value={jobsDateTo}
                min={jobsDateFrom || undefined}
                title="To scheduled date"
                onChange={(e) => setJobsDateTo(e.target.value)}
                className={`border rounded-md px-2.5 py-1.5 text-[13px] font-semibold outline-none cursor-pointer bg-white ${jobsDateTo ? 'border-yellow-400 text-gray-900' : 'border-gray-200 text-gray-400'}`}
              />
              <button onClick={() => downloadJobsCsv(filtered, ec, jobsDateFrom, jobsDateTo)} disabled={!filtered.length} className="border border-gray-200 bg-white text-gray-700 rounded-md px-2.5 py-1.5 font-semibold text-xs cursor-pointer whitespace-nowrap disabled:opacity-40">⬇ Download CSV ({filtered.length})</button>
              {(jobsDateFrom || jobsDateTo) && <button onClick={() => { setJobsDateFrom(''); setJobsDateTo(''); }} className="border-0 bg-red-100 text-red-600 rounded-md px-2.5 py-1.5 font-bold text-xs cursor-pointer whitespace-nowrap">✕ Clear date</button>}
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Job ID</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Type</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Customer</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">EC</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Category</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Assigned To</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Status</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Date</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length ? pageRows.map((j, i) => (
                <tr key={i} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedJob({ pi: j.id, type: j.type })}>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100"><b className="font-mono text-xs text-gray-900">{j.id}</b></td>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100"><span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${j.type === 'audit' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{j.type === 'audit' ? 'Audit' : 'Install'}</span></td>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100"><b>{j.customer}</b></td>
                  <td className={`px-3 py-2.5 text-[13px] border-t border-gray-100 whitespace-nowrap ${ec.status === 'error' ? 'text-amber-600' : 'text-gray-700'}`} title={ec.status === 'error' ? 'Could not load ECs from the backend' : undefined}>{ecName(ec, j)}</td>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100">
                    <div className="flex flex-col gap-1">
                      {j.cats.length ? j.cats.map((c, k) => (
                        <span key={k} className="inline-block w-fit px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 whitespace-nowrap">
                          {c.label}{c.installer ? <span className="text-gray-500 font-normal"> · {c.installer}</span> : null}
                        </span>
                      )) : <span className="text-gray-300">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100">{j.assignee || <span className="text-red-600 font-semibold">Unassigned</span>}</td>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100"><JobChip s={j.status} /></td>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100 whitespace-nowrap">
                    <div className="text-gray-900">{whenText(j)}</div>
                    {j.type === 'install' && j.date && !j.booked ? <div className="text-[11px] text-gray-400">Delivery · not booked yet</div> : null}
                  </td>
                </tr>
              )) : <tr><td colSpan={8} className="border-t border-gray-100"><div className="text-center py-8"><div className="text-2xl mb-2">🔍</div><div className="text-[13px] text-gray-400">No jobs match this filter</div></div></td></tr>}
            </tbody>
          </table>
          {filtered.length > JOBS_PAGE_SIZE ? (
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 sm:px-6 py-3 text-[12.5px] text-gray-500">
              <span>Showing {(curPage - 1) * JOBS_PAGE_SIZE + 1}–{Math.min(curPage * JOBS_PAGE_SIZE, filtered.length)} of {filtered.length}</span>
              <span className="flex gap-2">
                <button disabled={curPage <= 1} onClick={() => setPage(curPage - 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default">← Prev</button>
                <button disabled={curPage >= totalPages} onClick={() => setPage(curPage + 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default">Next →</button>
              </span>
            </div>
          ) : null}
        </div>
      )}

      {selectedJob && (
        <div className="fixed inset-0 bg-black/30 z-[900] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setSelectedJob(null); }}>
          <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <JobDetailModal pi={selectedJob.pi} type={selectedJob.type} closeModal={() => setSelectedJob(null)} />
          </div>
        </div>
      )}
    </>
  );
}
