'use client';

import { fmtPhone } from '../../../drawers/firm/utils';
import { ClientEntity, STUDIO_ACCESS, isOnboarded, normalizeContactNumber } from '../../../models/client';
import { StudioRow } from '../types';

export function StudioTable({ rows, onOpen }: { rows: StudioRow[]; onOpen: (c: ClientEntity) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] min-w-[760px]">
        <thead>
          <tr className="bg-gray-50 text-gray-400 text-[9px] uppercase tracking-wider border-b border-gray-200">
            <th className="text-left font-semibold px-4 py-2.5">Firm</th>
            <th className="text-left font-semibold px-3 py-2.5">KAM</th>
            <th className="text-left font-semibold px-3 py-2.5">Numbers on Studio Space</th>
            <th className="text-right font-semibold px-3 py-2.5">Onboarded</th>
            <th className="text-right font-semibold px-4 py-2.5">Unclassified</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ client, studio }) => {
            const onboarded = (client.contacts || []).filter((c) => normalizeContactNumber(c.number) && isOnboarded(c));
            return (
              <tr key={client.id} onClick={() => onOpen(client)} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer align-top">
                <td className="px-4 py-2.5 font-semibold text-gray-800">{client.company || <span className="text-gray-400 italic">Unnamed firm</span>}</td>
                <td className="px-3 py-2.5 text-gray-600">{client.kam || <span className="text-red-600 font-semibold">No KAM</span>}</td>
                <td className="px-3 py-2.5">
                  {onboarded.length ? (
                    <div className="flex flex-wrap gap-1">
                      {onboarded.map((c) => (
                        <span key={c.number} title={`${STUDIO_ACCESS[c.studioAccess!].hint}${c.label ? ` · ${c.label}` : ''}`}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${c.studioAccess === 'power' ? 'bg-teal-50 text-[#0F766E]' : 'bg-gray-100 text-gray-600'}`}>
                          <span className="font-mono">{fmtPhone(c.number)}</span>
                          {c.studioAccess === 'power' ? 'Power' : 'Orders + Rewards'}
                        </span>
                      ))}
                    </div>
                  ) : <span className="text-gray-300">none</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-700">{studio.onboarded}/{studio.numbers}</td>
                <td className={`px-4 py-2.5 text-right font-mono ${studio.unclassified ? 'text-amber-700 font-semibold' : 'text-gray-300'}`}>{studio.unclassified}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
