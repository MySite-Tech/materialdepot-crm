'use client';

import type { ReadonlyURLSearchParams } from 'next/navigation';

import AppointmentTrackerClient from '../../appointment-tracker/tracker';
import B2BSalesCRM from '../../b2b/views/b2-b-sales-crm';
import Dashboard from '../../dashboard/overview';
import FootfallTab from '../../footfall/footfall-tab';
import NPSDashboard from '../../nps/dashboard';
import ReportCardDashboard from '../../report-card/dashboard';
import MobileDashboard from '../../sales-dashboard/mobile-dashboard';
import SiteAuditOwnDashboard from '../../site-audit/views/own-dashboard';
import SiteAuditRail from '../../site-audit/views/rail';
import StoreDisplayTab from '../../store-display';
import StoreVisitWrapper from '../../store-visit/store-visit-wrapper';
import WeeklyFunnelDashboard from '../../weekly-funnel/dashboard';

import { AppUser } from '../../../types/crm';
import { AdminDashboard } from '../admin/dashboard';
import { MainTab } from '../types';
import { canAdminStoreDisplay } from '../utils';

export function CrmTabPanels({ branches, branchesLoaded, currentUser, effectiveTab, searchParams, siteAuditIsOversight, siteAuditRole, userAllowedBranches }: {
  branches: string[];
  branchesLoaded: boolean;
  currentUser: AppUser;
  effectiveTab: MainTab;
  searchParams: ReadonlyURLSearchParams;
  siteAuditIsOversight: boolean;
  siteAuditRole: string | null;
  userAllowedBranches: string[];
}) {
  return (
    <>
          {effectiveTab === 'dashboard' && (
      <Dashboard branches={branches} allowedBranches={userAllowedBranches} orderLostOnly={currentUser?.role === 'retail'} />
    )}
    
    {effectiveTab === 'footfall' && (
      <FootfallTab branches={branches} allowedBranches={userAllowedBranches} />
    )}
    
    {effectiveTab === 'weeklyFunnel' && (
      <WeeklyFunnelDashboard branches={branches} allowedBranches={userAllowedBranches} />
    )}
    
    {effectiveTab === 'reportCard' && (
      <ReportCardDashboard branches={branches} allowedBranches={userAllowedBranches} currentUserPhone={currentUser?.phone ?? ''} />
    )}
    
    {effectiveTab === 'storeVisit' && (
      <StoreVisitWrapper />
    )}
    
    {effectiveTab === 'nps' && (
      <NPSDashboard branches={branches} allowedBranches={userAllowedBranches} />
    )}
    
    {effectiveTab === 'siteAudit' && (
      siteAuditIsOversight ? (
        <SiteAuditRail user={currentUser ? { name: currentUser.name, phone: currentUser.phone, role: currentUser.role } : null} />
      ) : (
        <SiteAuditOwnDashboard
        contact={currentUser?.phone || ''}
        permissionRole={siteAuditRole}
        crmName={currentUser?.name || ''}
        allowedBranches={currentUser?.allowedBranches || []}
      />
      )
    )}
    
    {effectiveTab === 'admin' && (
      <AdminDashboard />
    )}
    
    {effectiveTab === 'sales' && <MobileDashboard userName={currentUser?.name ?? ''} jumpTo={searchParams.get('ticket')} />}
    
    {effectiveTab === 'b2bSales' && <B2BSalesCRM />}
    
    {effectiveTab === 'appointmentTracker' && (
      <AppointmentTrackerClient currentUser={currentUser} branches={branchesLoaded ? branches : undefined} />
    )}
    
    {effectiveTab === 'storeDisplay' && <StoreDisplayTab isAdmin={canAdminStoreDisplay(currentUser)} />}
    
    {!effectiveTab && (
      <div className="p-10 text-center text-sm text-gray-400">
        No CRM tabs are enabled for this account. Ask an admin to grant permissions under Admin &gt; Users.
      </div>
    )}
    </>
  );
}
