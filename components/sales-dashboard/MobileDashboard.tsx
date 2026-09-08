"use client";

import MobileEscalationClient from "@/components/sales-dashboard/MobileEscalationClient";
import MobileRaiseClient from "@/components/sales-dashboard/MobileRaiseClient";
import { useState } from "react";

export default function MobileDashboard(
  { userName, jumpTo }: { userName: string; jumpTo?: string | null },
) {
  /* `jumpTo` is the `?ticket=` param — the deep link the escalation WhatsApp
     alert sends to the sales owner (see ESCALATION_ALERT_LINK_BASE in the
     backend's kylas constants). It lands on Status rather than Raise, because
     the recipient is being shown an escalation that already exists, and
     MobileEscalationClient turns on exactMode for a jump so the full deal name
     matches one ticket instead of every ticket sharing its ENQ. */
  const [tab, setTab] = useState<"raise" | "status">(jumpTo ? "status" : "raise");
  const [jumpToSearch, setJumpToSearch] = useState<string | null>(jumpTo ?? null);

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
