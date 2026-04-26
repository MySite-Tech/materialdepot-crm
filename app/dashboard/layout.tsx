"use client";

import DashboardNav from "@/components/DashboardNav";
import { ReactNode } from "react";
import { useRouter } from "next/navigation";

// Main App Header Component
function AppHeader() {
  return (
    <header className="sticky top-0 z-[900] h-12 bg-[#1A1A1A] flex items-center px-6 justify-between border-b border-gray-700">
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-white">material</span>
        <span className="text-sm font-bold text-[#EAB308] -ml-2.5">depot</span>
        <span className="text-xs text-gray-400 ml-2">Sales CRM</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-300">User</span>
        <button
          className="bg-transparent border border-gray-600 text-gray-400 text-[11px] px-2.5 py-1 rounded cursor-pointer hover:text-white hover:border-gray-400"
          onClick={() => {
            // Handle logout logic
            window.location.href = '/';
          }}
        >
          Logout
        </button>
      </div>
    </header>
  );
}

// Main App Tab Navigation Component
function AppTabNav() {
  const router = useRouter();
  const activeTab = 'sales';
  const tabs = [
    { key: 'leads' as const, label: 'Leads' },
    { key: 'dashboard' as const, label: 'Dashboard' },
    { key: 'storeVisit' as const, label: 'Store Visit Form' },
    { key: 'sales' as const, label: 'Sales' }
  ];

  const handleTabClick = (tab: string) => {
    if (tab === 'sales') {
      router.push('/dashboard');
    } else {
      router.push('/');
    }
  };

  return (
    <div className="bg-[#1A1A1A] border-t border-gray-700 px-6 flex gap-1">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => handleTabClick(t.key)}
          className={`px-4 py-2 text-[12px] font-semibold border-b-2 cursor-pointer bg-transparent transition-colors ${
            activeTab === t.key ? 'border-[#EAB308] text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <AppHeader />
      <AppTabNav />
      <DashboardNav />
      <main className="px-3 py-3 sm:px-6 sm:py-4 overflow-auto">
        {children}
      </main>
    </div>
  );
}
