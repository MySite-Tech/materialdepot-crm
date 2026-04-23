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
    <div className="mb-8 border-b border-gray-200">
      <nav className="-mb-px flex space-x-8">
        {dashboardTabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              pathname === tab.href
                ? "border-yellow-500 text-yellow-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
