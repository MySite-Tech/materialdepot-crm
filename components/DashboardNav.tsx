"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const dashboardTabs = [
  { href: "/dashboard/stats", label: "Stats" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/deals", label: "Deals" },
  { href: "/dashboard/resolution", label: "Resolution" },
  { href: "/dashboard/mobile", label: "Mobile" },
];

export default function DashboardNav() {
  const pathname = usePathname();

  return (
    <div className="bg-[#1A1A1A] border-t border-gray-700 px-2 sm:px-6 flex gap-0 overflow-x-auto [&::-webkit-scrollbar]:hidden">
      {dashboardTabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`px-3 sm:px-4 py-2 text-[12px] font-semibold border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
            pathname === tab.href
              ? "border-[#EAB308] text-white"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
