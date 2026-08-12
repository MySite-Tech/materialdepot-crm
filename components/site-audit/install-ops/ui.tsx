'use client';

/* Small shared presentational bits used across the Install Ops views —
   Tailwind ports of Chip/MapLink/pill-list/subjob-summary from
   SMInstall.jsx, styled per this CRM's Site Audit conventions (white cards,
   #EAB308 accent, status pill patterns already used in SiteAuditJobsView). */

import type { ReactElement } from 'react';
import { fmtDate, installerById, STATUS } from './shared';
import { typeTag } from '../auditRegistry';
import type { InstallCategory, InstallOrder, Installer, Subjob } from './types';

export function Chip({ st }: { st: string }) {
  const s = STATUS[st] || { l: st, badge: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${s.badge}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.l}
    </span>
  );
}

export function MapLink({ addr }: { addr: string }) {
  return (
    <a
      className="text-blue-600 font-medium flex items-center gap-1 hover:underline min-w-0 max-w-full"
      href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="shrink-0">📍</span>
      <span className="truncate min-w-0">{addr}</span>
    </a>
  );
}

export function OrderCategoryPills({ o }: { o: InstallOrder }) {
  if (o.service) {
    const cats: ReactElement[] = [];
    if (o.service.flooring && o.service.flooring.length) cats.push(<span key="fl" className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-yellow-50 text-yellow-800">Flooring</span>);
    if (o.service.wallpaper && o.service.wallpaper.length) {
      cats.push(o.customWp
        ? <span key="wp" className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-orange-100 text-orange-800">Custom WP</span>
        : <span key="wp" className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-purple-100 text-purple-700">Wallpaper</span>);
    }
    if (o.service.wallpanel && o.service.wallpanel.length) cats.push(<span key="wpl" className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-teal-100 text-teal-700">Wall Panels</span>);
    if (cats.length) return <div className="flex flex-wrap gap-1">{cats}</div>;
  }
  const seen: Record<string, boolean> = {};
  const cats: ReactElement[] = [];
  (o.skus || []).forEach((s) => {
    if (s.type === 'flooring' && !seen.fl) { seen.fl = true; cats.push(<span key="fl" className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-yellow-50 text-yellow-800">Flooring</span>); }
    if (s.type === 'wallpaper' && !seen.wp) {
      seen.wp = true;
      cats.push(o.customWp
        ? <span key="wp" className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-orange-100 text-orange-800">Custom WP</span>
        : <span key="wp" className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-purple-100 text-purple-700">Wallpaper</span>);
    }
    if (s.type === 'wallpanel' && !seen.wpl) { seen.wpl = true; cats.push(<span key="wpl" className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-teal-100 text-teal-700">Wall Panels</span>); }
  });
  return cats.length ? <div className="flex flex-wrap gap-1">{cats}</div> : <span className="text-gray-400">—</span>;
}

export function SubjobSummary({ o, installers }: { o: InstallOrder; installers: Installer[] }) {
  if (!o.subjobs) return <span className="text-gray-400">—</span>;
  return (
    <div className="flex flex-col gap-1">
      {o.subjobs.map((sj, i) => {
        const asgns = sj.assignments && sj.assignments.length
          ? sj.assignments
          : sj.installer
            ? [{ installer_name: (installerById(installers, sj.installer) || { name: 'Unknown' }).name }]
            : [];
        const names = asgns.map((a: any) => a.installer_name || 'Unassigned').join(', ') || 'Unassigned';
        return (
          <span key={i} className="block max-w-[220px] truncate text-[12px] text-gray-600" title={`${fmtDate(sj.date)} · ${names} · ${(STATUS[sj.status] || { l: sj.status }).l}`}>
            <span className={`inline-block mr-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${sjTypeClass(sj.type)}`}>
              {typeTag(sj.type)}
            </span>
            {fmtDate(sj.date)} · {names} · {(STATUS[sj.status] || { l: sj.status }).l}
          </span>
        );
      })}
    </div>
  );
}

/* Shared per-track tag colour — single source so badges across the list, queues and calendar can't
   drift from each other as categories are added. */
export function sjTypeClass(type: InstallCategory | string): string {
  return type === 'wallpaper'
    ? 'bg-purple-100 text-purple-700'
    : type === 'wallpanel'
      ? 'bg-teal-100 text-teal-700'
      : 'bg-yellow-50 text-yellow-800';
}

export function TypeTag({ type }: { type: InstallCategory | string }) {
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${sjTypeClass(type)}`}>{typeTag(type)}</span>;
}

export function StatTile({ n, l, colorClass, onClick }: { n: number | string; l: string; colorClass: string; onClick?: () => void }) {
  return (
    <div
      className="rounded-lg border border-gray-200 bg-white px-4 py-3 cursor-pointer hover:border-[#EAB308] transition-colors"
      onClick={onClick}
    >
      <div className={`font-mono text-2xl font-bold ${colorClass}`}>{n}</div>
      <div className="text-[11.5px] text-gray-500 font-semibold mt-0.5">{l}</div>
    </div>
  );
}

export function Note({ tone = 'blue', children }: { tone?: 'blue' | 'red' | 'amber' | 'green'; children: React.ReactNode }) {
  const toneMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-400 text-[#1F3A5F]',
    red: 'bg-red-50 border-red-500 text-red-700',
    amber: 'bg-amber-50 border-amber-500 text-amber-800',
    green: 'bg-green-50 border-green-600 text-green-700',
  };
  return <div className={`rounded-md border-l-4 px-3 py-2.5 text-[12px] my-2.5 ${toneMap[tone]}`}>{children}</div>;
}

export function Toast({ message, show }: { message: string; show: boolean }) {
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-gray-900 text-white text-[13px] font-medium px-4 py-2.5 rounded-md shadow-lg transition-opacity duration-300 ${
        show ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {message}
    </div>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-center text-gray-400 py-8 border-t border-gray-100">
        {children}
      </td>
    </tr>
  );
}
