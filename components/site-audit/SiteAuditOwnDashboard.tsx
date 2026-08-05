'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { sbGet } from './siteAuditShared';
import SiteAuditorApp from './SiteAuditorApp';
import SiteInstallerApp from './SiteInstallerApp';
import SiteAuditJobsView from './SiteAuditJobsView';
import SiteAuditPerfView from './SiteAuditPerfView';
import SiteAuditAnalyticsView from './SiteAuditAnalyticsView';
import SiteAuditInstallOpsView from './SiteAuditInstallOpsView';

/* leaflet touches `window` at module-load time — see SiteAuditRail.tsx. */
const SiteAuditLiveView = dynamic(() => import('./SiteAuditLiveView'), { ssr: false });

type Person = { id: string; name: string; email: string; role: string };

/* Renders the logged-in CRM user's own Site Audit dashboard, resolving their
   field-app identity by phone (profiles.contact) instead of email — the CRM
   only ever has a phone number for its own users, not an email. */
export default function SiteAuditOwnDashboard({ contact, permissionRole }: { contact: string; permissionRole: string | null }) {
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [combinedView, setCombinedView] = useState<'auditor' | 'installer'>('auditor');
  const [smTab, setSmTab] = useState<'audit' | 'install'>('audit');
  const [smAuditSubTab, setSmAuditSubTab] = useState<'jobs' | 'perf' | 'analytics' | 'live'>('jobs');

  useEffect(() => {
    if (!contact) { setLoading(false); return; }
    let alive = true;
    sbGet('profiles?contact=eq.' + encodeURIComponent(contact) + '&select=id,name,email,role&limit=1').then((rows) => {
      if (!alive) return;
      setPerson(Array.isArray(rows) && rows[0] ? rows[0] : null);
      setLoading(false);
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [contact]);

  if (loading) {
    return <div className="p-6 text-center text-sm text-gray-400">Loading…</div>;
  }
  if (!person) {
    return (
      <div className="p-6 text-center text-sm text-gray-400">
        No Site Audit profile found for this phone number yet. Ask an admin to link it in the field-app profile.
      </div>
    );
  }

  const actingAs = { id: person.id, name: person.name, email: person.email };

  if (permissionRole === 'site_auditor') {
    return <div className="p-4 sm:p-6"><SiteAuditorApp actingAs={actingAs} /></div>;
  }
  if (permissionRole === 'installer') {
    return <div className="p-4 sm:p-6"><SiteInstallerApp actingAs={actingAs} /></div>;
  }
  if (permissionRole === 'auditor_installer') {
    return (
      <div>
        <div className="bg-white border-b border-gray-200">
          <div className="px-6 flex gap-0">
            {([['auditor', 'Auditor view'], ['installer', 'Installer view']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setCombinedView(k)}
                className={`px-5 py-3 text-[13px] font-semibold border-b-2 cursor-pointer bg-transparent ${combinedView === k ? 'border-[#EAB308] text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 sm:p-6">
          {combinedView === 'auditor' ? <SiteAuditorApp actingAs={actingAs} /> : <SiteInstallerApp actingAs={actingAs} />}
        </div>
      </div>
    );
  }
  if (permissionRole === 'service_mgr') {
    return (
      <div>
        <div className="bg-white border-b border-gray-200">
          <div className="px-6 flex gap-0">
            {([['audit', 'Audit Dashboard'], ['install', 'Install Dashboard']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSmTab(k)}
                className={`px-5 py-3 text-[13px] font-semibold border-b-2 cursor-pointer bg-transparent ${smTab === k ? 'border-[#EAB308] text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 sm:p-6">
          {smTab === 'audit' && (
            <div className="flex gap-2 flex-wrap mb-4">
              {([
                ['jobs', 'Job Overview'],
                ['perf', 'Performance'],
                ['analytics', 'Analytics'],
                ['live', 'Live'],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setSmAuditSubTab(k)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold ${smAuditSubTab === k ? 'bg-[#EAB308] text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-400'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {smTab === 'install' ? (
            <SiteAuditInstallOpsView />
          ) : smAuditSubTab === 'jobs' ? (
            <SiteAuditJobsView />
          ) : smAuditSubTab === 'perf' ? (
            <SiteAuditPerfView />
          ) : smAuditSubTab === 'analytics' ? (
            <SiteAuditAnalyticsView />
          ) : (
            <SiteAuditLiveView />
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="p-6 text-center text-sm text-gray-400">
      No Site Audit dashboard permission set for this account. Ask an admin to grant a Site Audit sub-role under Admin &gt; Users.
    </div>
  );
}
