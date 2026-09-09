'use client';

import { AppUser } from '../../types/crm';

export function CrmHeader({ currentUser, handleLogout }: {
  currentUser: AppUser;
  handleLogout: () => void;
}) {
  return (
    <header className="sticky top-0 z-[900] h-12 bg-[#1A1A1A] flex items-center px-3 sm:px-6 justify-between">
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="text-sm font-bold text-white">material</span>
        <span className="text-sm font-bold text-[#EAB308] -ml-2.5">depot</span>
        <span className="text-xs text-gray-400 ml-1 sm:ml-2 hidden sm:inline">Sales CRM</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <span className="text-xs text-gray-300 max-w-[80px] truncate">{currentUser.name}</span>
        <button
          className="bg-transparent border border-gray-600 text-gray-400 text-[11px] px-2 sm:px-2.5 py-1 rounded cursor-pointer hover:text-white hover:border-gray-400 whitespace-nowrap"
          onClick={handleLogout}
        >
          Logout
        </button>
      </div>
    </header>
  );
}
