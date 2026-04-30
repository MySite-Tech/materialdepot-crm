"use client";

import MobileEscalationClient from "@/components/sales-dashboard/MobileEscalationClient";
import MobileRaiseClient from "@/components/sales-dashboard/MobileRaiseClient";
import { useState } from "react";

export default function MobileDashboard({ userName }: { userName: string }) {
  const [tab, setTab] = useState<"raise" | "status">("raise");
  const [jumpToSearch, setJumpToSearch] = useState<string | null>(null);

  return (
    <div>
      <div className="flex border-b border-gray-200 px-3">
        <button
          onClick={() => setTab("raise")}
          className={`px-3 py-2 text-[12px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
            tab === "raise" ? "border-[#EAB308] text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700"
          }`}
        >
          Raise Escalation
        </button>
        <button
          onClick={() => { setTab("status"); setJumpToSearch(null); }}
          className={`px-3 py-2 text-[12px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
            tab === "status" ? "border-[#EAB308] text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700"
          }`}
        >
          Status
        </button>
      </div>

      <div className="px-3 py-3">
        {tab === "raise" ? (
          <MobileRaiseClient
            userName={userName}
            onViewDeal={(dealName) => { setJumpToSearch(dealName); setTab("status"); }}
          />
        ) : (
          <MobileEscalationClient jumpToSearch={jumpToSearch} userName={userName} />
        )}
      </div>
    </div>
  );
}
