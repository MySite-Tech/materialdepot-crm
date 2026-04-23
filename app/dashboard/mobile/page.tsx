"use client";

import MobileEscalationClient from "@/components/sales-dashboard/MobileEscalationClient";
import MobileRaiseClient from "@/components/sales-dashboard/MobileRaiseClient";
import { useState, useEffect } from "react";

export default function MobileDashboardPage() {
  const [tab, setTab] = useState<"raise" | "status">("raise");
  const [jumpToSearch, setJumpToSearch] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("md_user_name");
    if (saved) setUserName(saved);
  }, []);

  // Name gate
  if (userName === null) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 justify-center">
            <div className="w-8 h-8 rounded bg-yellow-400 flex items-center justify-center">
              <span className="text-gray-950 font-black text-sm">MD</span>
            </div>
            <span className="text-lg font-bold text-white tracking-tight">Material Depot</span>
          </div>
          <div className="bg-white rounded-xl p-6">
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
    <div className="pb-16 bg-white min-h-screen">
      {/* MD Header */}
      <div className="bg-gray-950 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-yellow-400 flex items-center justify-center">
            <span className="text-gray-950 font-black text-xs">MD</span>
          </div>
          <span className="text-sm font-bold text-white tracking-tight">Material Depot</span>
        </div>
        <button
          onClick={() => {
            const newName = prompt("Change your name:", userName);
            if (newName?.trim()) {
              localStorage.setItem("md_user_name", newName.trim());
              setUserName(newName.trim());
            }
          }}
          className="text-xs text-gray-400 hover:text-yellow-400 transition-colors"
        >
          {userName}
        </button>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-40 bg-gray-950 border-b border-gray-800">
        <div className="flex">
          <button
            onClick={() => setTab("raise")}
            className={`flex-1 py-3 text-sm font-semibold text-center transition-colors ${
              tab === "raise"
                ? "text-yellow-400 border-b-2 border-yellow-400"
                : "text-gray-400"
            }`}
          >
            Raise Escalation
          </button>
          <button
            onClick={() => {
              setTab("status");
              setJumpToSearch(null);
            }}
            className={`flex-1 py-3 text-sm font-semibold text-center transition-colors ${
              tab === "status"
                ? "text-yellow-400 border-b-2 border-yellow-400"
                : "text-gray-400"
            }`}
          >
            Status
          </button>
        </div>
      </div>

      <div className="p-4">
        {tab === "raise" ? (
          <MobileRaiseClient
            userName={userName}
            onViewDeal={(dealName) => {
              setJumpToSearch(dealName);
              setTab("status");
            }}
          />
        ) : (
          <MobileEscalationClient jumpToSearch={jumpToSearch} userName={userName} />
        )}
      </div>
    </div>
  );
}
