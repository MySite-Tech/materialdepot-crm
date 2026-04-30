"use client";

import MobileEscalationClient from "@/components/sales-dashboard/MobileEscalationClient";
import MobileRaiseClient from "@/components/sales-dashboard/MobileRaiseClient";
import { useState, useEffect } from "react";

export default function MobileDashboard() {
  const [tab, setTab] = useState<"raise" | "status">("raise");
  const [jumpToSearch, setJumpToSearch] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("md_user_name");
    if (saved) setUserName(saved);
  }, []);

  if (userName === null) {
    return (
      <div className="flex items-center justify-center p-6 py-16">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <p className="text-sm font-semibold text-gray-900 mb-1">Enter your name</p>
            <p className="text-xs text-gray-500 mb-4">This will be shown on notes and uploads you make.</p>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g. Kavya Tangodi"
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 mb-3"
              onKeyDown={(e) => {
                if (e.key === "Enter" && nameInput.trim()) {
                  localStorage.setItem("md_user_name", nameInput.trim());
                  setUserName(nameInput.trim());
                }
              }}
            />
            <button
              onClick={() => {
                if (nameInput.trim()) {
                  localStorage.setItem("md_user_name", nameInput.trim());
                  setUserName(nameInput.trim());
                }
              }}
              disabled={!nameInput.trim()}
              className="w-full py-2.5 rounded-lg bg-yellow-400 text-gray-950 text-sm font-bold disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

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
