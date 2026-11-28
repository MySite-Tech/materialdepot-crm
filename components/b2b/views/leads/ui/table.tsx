'use client';

import type { ReactNode } from 'react';
import { fmtINR } from '../../../models/mock-data';
import { LeadName } from '../../../ui/inbound-chips';
import type { UnifiedLead } from '@/lib/b2b';
import type { LeadSection } from '../constants';
import { ecOf, fmtCreated } from '../utils';
import { ExpectedClosureCell, ReferrerCell, SourceCell, StageCell, UnifiedStatusCell } from './cells';

interface Column {
  head: string;
  right?: boolean;
  cell: (l: UnifiedLead, today: string) => ReactNode;
}

const dash = <span className="text-gray-300">—</span>;

const LEAD: Column = {
  head: 'Lead',
  cell: (l) => (
    <>
      <div className="font-medium text-gray-900 truncate max-w-[240px]">
        {l.companyName || <LeadName lead={{ company: l.inbound?.company, phone: l.phone }} />}
      </div>
      <div className="text-[12px] text-gray-500 truncate max-w-[240px]">
        {[l.contactPerson && l.contactPerson !== l.companyName ? l.contactPerson : '', l.phone].filter(Boolean).join(' · ') || '—'}
      </div>
    </>
  ),
};

const created = (head: string): Column => ({
  head,
  cell: (l, today) => <span className="tabular-nums text-gray-700 whitespace-nowrap">{fmtCreated(l.createdAt, today) || '—'}</span>,
});

const STAGE: Column = { head: 'Stage', cell: (l) => <StageCell lead={l} /> };
const STATUS: Column = { head: 'Status', cell: (l) => <UnifiedStatusCell lead={l} /> };
const ENQ: Column = { head: 'Enquiry ID', cell: (l) => (l.enqId ? <span className="tabular-nums text-gray-700">{l.enqId}</span> : dash) };
const VALUE: Column = {
  head: 'Order value', right: true,
  cell: (l) => (l.orderValue ? <span className="tabular-nums text-gray-900">{fmtINR(l.orderValue)}</span> : dash),
};
const text = (head: string, read: (l: UnifiedLead) => string | undefined): Column => ({
  head, cell: (l) => (read(l) ? <span className="text-gray-700 whitespace-nowrap">{read(l)}</span> : dash),
});

export const COLUMNS: Record<LeadSection, Column[]> = {
  pipeline: [
    created('Created'), LEAD, { head: 'Source', cell: (l) => <SourceCell lead={l} /> }, text('Owner', (l) => l.spok),
    STAGE, STATUS, ENQ, VALUE, { head: 'Expected closure', cell: (l) => <ExpectedClosureCell lead={l} /> }, text('KAM', (l) => l.kam),
  ],
  ec: [
    created('Referred on'), LEAD, text('From EC', ecOf), { head: 'Referred by', cell: (l) => <ReferrerCell lead={l} /> },
    text('Outreach BM', (l) => l.spok), STAGE, STATUS, ENQ, VALUE,
  ],
};

const th = 'px-3 py-2.5 text-[12px] font-normal text-gray-500 whitespace-nowrap';

export function LeadTable({ section, rows, today, onOpen, select }: {
  section: LeadSection;
  rows: UnifiedLead[];
  today: string;
  onOpen: (key: string) => void;
  select?: { picked: Set<string>; toggle: (k: string) => void; allOnPage: boolean; togglePage: () => void };
}) {
  const cols = COLUMNS[section];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="bg-gray-50/60">
          <tr>
            {select && (
              <th className="pl-5 w-8"><input type="checkbox" checked={select.allOnPage} onChange={select.togglePage} aria-label="Select this page" /></th>
            )}
            {cols.map((c, i) => (
              <th key={c.head} className={`${th} ${c.right ? 'text-right' : 'text-left'} ${i === 0 && !select ? 'pl-5' : ''}`}>{c.head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.key} onClick={() => onOpen(l.key)} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer">
              {select && (
                <td className="pl-5 py-2.5 align-top" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={select.picked.has(l.key)} onChange={() => select.toggle(l.key)} aria-label={`Select ${l.companyName || l.phone || 'lead'}`} />
                </td>
              )}
              {cols.map((c, i) => (
                <td key={c.head} className={`px-3 py-2.5 align-top ${c.right ? 'text-right' : ''} ${i === 0 && !select ? 'pl-5' : ''}`}>{c.cell(l, today)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
