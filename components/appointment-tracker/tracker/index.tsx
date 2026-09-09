'use client';

import AdminOverview from '../admin-overview';
import { PresalesCalendar } from './ui/calendar';
import { DateRangeControl, SelectChip } from './ui/chips';
import { ManagerSummary, ReceptionistList } from './ui/lists';
import { RotaPlanner } from './rota';
import { fetchFootfall, fetchPlan } from './rota/data';
import { DateRange, FootfallMap, RotaPlan } from '../types/appointments';
import { ageLabel, defaultPlan, defaultRange, shortDate } from './utils';
import { Branch, EcReadyEntry, EcReadyMap, LS, ApptLead as Lead, Role, apptBranchesFor, apptBranchesFromCrm, branchFrom, fetchApptFeed, loadEcReady, resolveApptRole, saveEcReady } from '@/lib/appointments/appt-shared';
import { AppUser } from '@/types/crm';
import { useCallback, useEffect, useMemo, useState } from 'react';

export default function AppointmentTrackerClient({ currentUser, branches }: {
  currentUser: AppUser | null;

  branches?: string[];
}) {

  const role: Role = resolveApptRole(currentUser);
  const branchOptions = useMemo(() => apptBranchesFromCrm(branches), [branches]);
  const allowedBranches = useMemo(
    () => apptBranchesFor(currentUser, branchOptions),
    [currentUser, branchOptions],
  );
  const [branch, setBranch] = useState<Branch>(() => allowedBranches[0] ?? "JP Nagar");
  const userName = currentUser?.name ?? "";
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (allowedBranches.length > 0 && !allowedBranches.includes(branch)) {
      setBranch(allowedBranches[0]);
    }
  }, [allowedBranches, branch]);

  type AdminView = "calendar" | "reception" | "manager" | "overview";
  const [adminView, setAdminView] = useState<AdminView>("calendar");
  const showBranchBar = !(role === "admin" && adminView === "overview");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const [range, setRange] = useState<DateRange>(defaultRange);
  const { from: fromDate, to: toDate } = range;

  const [ec, setEc] = useState<EcReadyMap>({});
  const [savingEc, setSavingEc] = useState<Record<number, boolean>>({});

  const [plan, setPlan] = useState<RotaPlan>(() => defaultPlan());
  const [footfall, setFootfall] = useState<FootfallMap>({});

  const view: AdminView = role === "admin"
    ? adminView
    : role === "receptionist" ? "reception"
    : role === "manager" ? "manager"
    : "calendar";
  const needsPlan = view === "calendar" || view === "manager";
  const needsFootfall = view === "calendar" || view === "manager";

  useEffect(() => {
    try {

      const b = localStorage.getItem(LS.BRANCH);
      if (b) setBranch(b);
    } catch { /* ignore */ }
    setEc(loadEcReady());
    setHydrated(true);
  }, []);

  const [planLoaded, setPlanLoaded] = useState(false);
  useEffect(() => {
    if (!needsPlan || planLoaded) return;
    let cancelled = false;
    fetchPlan().then((p) => {
      if (cancelled) return;
      setPlan(p);
      setPlanLoaded(true);
    });
    return () => { cancelled = true; };
  }, [needsPlan, planLoaded]);

  const reloadPlan = useCallback(async () => {
    const fresh = await fetchPlan();
    setPlan(fresh);
    setPlanLoaded(true);
    return fresh;
  }, []);

  useEffect(() => { if (hydrated) localStorage.setItem(LS.BRANCH, branch); }, [branch, hydrated]);

  const loadLeads = useCallback(async (force = false) => {
    setLoading(true); setError(null);
    try {
      const feed = await fetchApptFeed(force);
      setLeads(feed.leads);
      setFetchedAt(feed.fetchedAt);
      setStale(!!feed.stale);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  useEffect(() => {
    if (!needsFootfall) return;
    let cancelled = false;
    fetchFootfall(branch, fromDate, toDate).then((w) => { if (!cancelled) setFootfall(w); });
    return () => { cancelled = true; };
  }, [needsFootfall, branch, fromDate, toDate]);

  const load = useCallback(() => loadLeads(true), [loadLeads]);

  const scopedLeads = useMemo(() => {
    return leads.filter((l) => branchFrom(l.companyBusinessType, branchOptions) === branch);
  }, [leads, branch, branchOptions]);

  const handleEcToggle = async (l: Lead, state: "ready" | "not_ready") => {
    const entry: EcReadyEntry = { state, by: userName || "Receptionist", at: new Date().toISOString() };
    const next = { ...ec, [l.id]: entry };
    setEc(next); saveEcReady(next);
    setSavingEc((s) => ({ ...s, [l.id]: true }));

    try {
      const label = state === "ready" ? "[EC_READY]" : "[EC_NOT_READY]";
      const stampIST = new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      await fetch("/api/notes/relation/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceEntity: { description: `<div><b>${label}</b> Experience Centre marked ${state === "ready" ? "READY" : "NOT READY"} by ${entry.by} · ${stampIST}</div>` },
          targetEntityId: String(l.id),
          targetEntityType: "LEAD",
        }),
      });
    } catch { /* silent — localStorage still has the state */ }
    setSavingEc((s) => ({ ...s, [l.id]: false }));
  };

  if (!currentUser) {
    return (
      <div className="px-3 sm:px-6 py-4 sm:py-5">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center text-[12px] text-gray-400">
          Sign in to the CRM to view the Appointment Tracker.
        </div>
      </div>
    );
  }

  return (
    <div>

      <div className="px-3 sm:px-6 pt-4 flex items-center gap-2 flex-wrap">
        {role === "admin" && ([
          { key: "calendar",  label: "EC Calendar" },
          { key: "reception", label: "Reception List" },
          { key: "manager",   label: "Branch Summary" },
          { key: "overview",  label: "Admin Overview" },
        ] as { key: AdminView; label: string }[]).map((v) => (
          <button
            key={v.key}
            onClick={() => setAdminView(v.key)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
              adminView === v.key
                ? "bg-[#EAB308] text-black border-[#EAB308] shadow-sm"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:text-gray-800"
            }`}
          >
            {v.label}
          </button>
        ))}

        <div className="flex items-center gap-2 ml-auto">
          <DateRangeControl value={range} onChange={setRange} />
          {showBranchBar && (
            <SelectChip<Branch>
              dot="branch"
              title="Branch"
              value={branch}
              onChange={setBranch}
              options={allowedBranches.map((b) => ({ value: b, label: b }))}
            />
          )}
          <button
            onClick={load}
            disabled={loading}
            title="Re-fetch appointments from Kylas"
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-semibold leading-[16px] text-gray-700 cursor-pointer hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <span className={loading ? "inline-block animate-spin" : "inline-block"}>↻</span>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      <div className="px-3 sm:px-6 pt-1.5 flex justify-end items-center gap-1.5 text-[11px] text-gray-400">
        {range.preset !== "custom" && <span>{shortDate(range.from)} – {shortDate(range.to)}</span>}
        {fetchedAt && (
          <>
            {range.preset !== "custom" && <span className="text-gray-300">·</span>}
            <span className={stale ? "text-amber-600" : ""} title={new Date(fetchedAt).toLocaleString("en-IN")}>
              {stale ? "⚠ stale · " : ""}{ageLabel(fetchedAt)}
            </span>
          </>
        )}
      </div>

      <div className="px-3 sm:px-6 py-4 sm:py-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-4 text-[12px] text-red-600">
          Error loading appointments: {error}
        </div>
      )}

      {(role === "presales" || (role === "admin" && adminView === "calendar")) && (
        <PresalesCalendar leads={scopedLeads} branch={branch} from={fromDate} to={toDate} plan={plan} footfall={footfall} />
      )}
      {(role === "receptionist" || role === "manager" || (role === "admin" && adminView === "reception")) && (
        <ReceptionistList leads={scopedLeads} ec={ec} savingEc={savingEc} onToggle={handleEcToggle} branch={branch} range={range} />
      )}
      {(role === "manager" || (role === "admin" && adminView === "manager")) && (
        <>
          <ManagerSummary leads={scopedLeads} branch={branch} ec={ec} footfall={footfall} range={range} />
          {planLoaded ? (
            <RotaPlanner plan={plan} reloadPlan={reloadPlan} branch={branch} branchOptions={allowedBranches} allowBranchSwitch={role === "admin"} />
          ) : (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 text-[12px] text-gray-400">
              Loading rota…
            </div>
          )}
        </>
      )}
      {role === "admin" && adminView === "overview" && (
        <AdminOverview allLeads={leads} ec={ec} range={range} branches={branchOptions} />
      )}
      </div>
    </div>
  );
}
