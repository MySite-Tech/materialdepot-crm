'use client';

import { OutreachLead } from '../../../models/mock-data';
import { WaitlistSignup } from '../../../models/outreach';
import { OUTREACH_KPIS, Period, kpiTarget, outreachKpis } from '../../../models/outreach/kpis';
import { BmOption } from '../types';
import { repOwns } from '../utils';
import { fmtTarget, fmtValue, paceFor, tone } from './utils';
import { useMemo } from 'react';

const th = 'px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap';

export function TeamTable({ leads, bms, period, today, teamLive, waitlist, onPick }: {
  leads: OutreachLead[];
  bms: BmOption[];
  period: Period;
  today: string;
  teamLive: boolean;
  waitlist: Map<string, WaitlistSignup> | null;
  onPick: (name: string) => void;
}) {
  const rows = useMemo(
    () => bms.map((o) => ({ o, k: outreachKpis(leads.filter(repOwns(o.rep)), period, waitlist) })),
    [leads, bms, period, waitlist],
  );
  return (
    <div className="bg-white rounded-lg border border-gray-200 min-w-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className={`${th} text-left`}>BM</th>
              <th className={`${th} text-right`}>Leads</th>
              {OUTREACH_KPIS.map((d) => {
                const t = kpiTarget(d, 1, period);
                return (
                  <th key={d.key} title={d.rule} className={`${th} text-right`}>
                    {d.short}
                    {t !== null && <span className="block font-semibold normal-case tracking-normal text-gray-300">/ {fmtTarget(d, t)}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ o, k }) => (
              <tr key={o.rep.phone || o.rep.name} onClick={() => onPick(o.rep.name)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">
                  {o.rep.name}
                  {teamLive && !o.onTeam && (
                    <span title="Holds leads but is not on the Outreach team list. Add them under B2B → Team, or reassign the leads." className="ml-1.5 text-[9.5px] font-semibold text-amber-600">not on team</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-500">{o.leads}</td>
                {OUTREACH_KPIS.map((d) => {
                  const t = kpiTarget(d, 1, period);
                  return (
                    <td key={d.key} title={k[d.key].sub} className={`px-3 py-2 text-right font-mono whitespace-nowrap ${tone(k[d.key].value, t, t === null ? null : paceFor(d, period, today)).text}`}>
                      {fmtValue(d, k[d.key].value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="px-4 py-6 text-center text-[12px] text-gray-400">No BM holds a lead yet.</p>}
    </div>
  );
}
