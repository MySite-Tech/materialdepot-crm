'use client';

import { fmtDate, fmtGst, fmtPhone } from '../../../drawers/firm/utils';
import { ClientEntity, FirmSpoc, SpocRole, STUDIO_ACCESS, contactLabel, contactNumbers, currentTemperature, firmStudioAccess, gstNumbers, primaryContact } from '../../../models/client';
import { useStudioLogins } from '../../../hooks/use-studio-logins';
import { firmHandover } from '../../../models/kam';
import { fmtShortINR } from '../../../models/mock-data';
import { Metric, StatusPill, TemperatureChip } from '../../../ui/client-chips';
import { SORT_FIRST_DIR } from '../constants';
import { SpocSources } from '../hooks/use-spoc-sources';
import { ClientColumn, ClientListRow, SortKey, SortState } from '../types';
import { sinceLabel } from '../utils';

function More({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="ml-1.5 px-1.5 py-px rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold font-sans">+{n}</span>;
}

function SortTh({ label, k, sort, onSort, align = 'left', className = '' }: {
  label: string;
  k: SortKey;
  sort: SortState;
  onSort: (s: SortState) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const on = sort.key === k;
  const next: SortState = on
    ? { key: k, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
    : { key: k, dir: SORT_FIRST_DIR[k] };
  return (
    <th className={`font-semibold py-2.5 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <button
        onClick={() => onSort(next)}
        title={`Sort by ${label.toLowerCase()}`}
        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-gray-800 ${on ? 'text-gray-800' : ''}`}
      >
        {label}
        <span className={on ? '' : 'opacity-0 group-hover/th:opacity-40'}>{on && sort.dir === 'asc' ? '▲' : '▼'}</span>
      </button>
    </th>
  );
}

function KamCell({ client }: { client: ClientEntity }) {
  const h = firmHandover(client);
  if (client.kam) {
    return (
      <>
        <span className="text-gray-700">{client.kam}</span>
        {h?.status === 'Pending' && (
          <div className="text-[10px] font-semibold text-violet-700 mt-0.5" title={`Assigned by ${h.by || 'an admin'}. Counts as theirs, and waits for them to accept.`}>waiting for sign-off</div>
        )}
      </>
    );
  }
  return (
    <>
      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700">No KAM</span>
      {h?.status === 'Rejected' && (
        <div className="text-[10px] text-red-700 mt-1 max-w-[180px] truncate" title={`${h.kam} rejected it: ${h.rejectReason || 'no reason'}`}>
          {h.kam} rejected: {h.rejectReason || 'no reason'}
        </div>
      )}
    </>
  );
}

function StudioCell({ client, studio }: { client: ClientEntity; studio: ReturnType<typeof useStudioLogins> }) {
  if (studio.loading) return <span className="text-gray-300">…</span>;
  if (!studio.logins) return <span className="text-[11px] text-amber-700" title={`Studio Space could not be read: ${studio.error}`}>Unknown</span>;
  const access = firmStudioAccess(client, studio.logins, studio.firms);
  if (!access) return <span className="text-gray-300">Not onboarded</span>;
  return (
    <span title={STUDIO_ACCESS[access].hint}
      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${access === 'power' ? 'bg-teal-50 text-[#0F766E]' : 'bg-gray-100 text-gray-600'}`}>
      {STUDIO_ACCESS[access].label}
    </span>
  );
}

function SpocCell({ role, spocs, source }: { role: SpocRole; spocs?: FirmSpoc[]; source: SpocSources }) {
  const logged = spocs?.find((s) => s.role === role);
  if (logged?.name) return <span className="text-gray-700" title={logged.detail}>{logged.name}</span>;
  if (role === 'ec') return <span className="text-gray-300" title="Nobody is logged. The BM on the last order shows on the Firm page: the list has no order rows, and reading them here would be one request per firm.">Not logged</span>;
  if (source.loading) return <span className="text-gray-300">…</span>;
  if (source.failed) return <span className="text-[11px] text-amber-700" title="The Inbound and Outreach leads could not be read">Unknown</span>;
  return <span className="text-gray-300" title={logged?.detail}>—</span>;
}

export function ClientTable({ rows, today, studio, sort, onSort, onOpen, picked, onPick, onPickPage, visible, spocs, spocSource }: {
  rows: ClientListRow[];
  today: string;
  studio: ReturnType<typeof useStudioLogins>;
  sort: SortState;
  onSort: (s: SortState) => void;
  onOpen: (c: ClientEntity) => void;
  picked?: Set<string>;
  onPick?: (id: string) => void;
  onPickPage?: () => void;
  visible: Set<ClientColumn>;
  spocs: Map<string, FirmSpoc[]>;
  spocSource: SpocSources;
}) {
  const show = (c: ClientColumn) => visible.has(c);
  const TH = 'text-left font-semibold px-3 py-2.5';
  const TEXT = 'px-3 py-2.5 whitespace-nowrap text-gray-700';
  const allOnPage = !!picked && rows.length > 0 && rows.every((r) => picked.has(r.client.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]" style={{ minWidth: 360 + visible.size * 105 }}>
        <thead>
          <tr className="group/th bg-gray-50 text-gray-400 text-[9px] uppercase tracking-wider border-b border-gray-200">
            {picked && (
              <th className="pl-4 w-6"><input type="checkbox" checked={allOnPage} onChange={onPickPage} aria-label="Select this page" /></th>
            )}
            <SortTh label="Firm" k="company" sort={sort} onSort={onSort} className="px-4" />
            {show('contact') && <th className={TH}>Primary contact</th>}
            {show('gst') && <th className={TH}>GST</th>}
            {show('orders') && <SortTh label="Orders" k="orders" sort={sort} onSort={onSort} align="right" className="px-3" />}
            {show('enquiries') && <th className={`${TH} text-right`}>Enquiries</th>}
            {show('revenue') && <SortTh label="Revenue" k="revenue" sort={sort} onSort={onSort} align="right" className="px-3" />}
            {show('avgOrder') && <th className={`${TH} text-right`}>Avg order</th>}
            {show('openCarts') && <th className={`${TH} text-right`}>Open carts</th>}
            {show('lastOrder') && <SortTh label="Last order" k="lastOrder" sort={sort} onSort={onSort} className="px-3 pl-5" />}
            {show('status') && <th className={TH}>Status</th>}
            {show('studio') && <th className={TH}>Studio Space</th>}
            {show('kam') && <th className={TH}>KAM SPoC</th>}
            {show('inboundSpoc') && <th className={TH}>Inbound SPoC</th>}
            {show('outreachSpoc') && <th className={TH}>Outreach SPoC</th>}
            {show('ecSpoc') && <th className={TH}>EC SPoC</th>}
            {show('clientType') && <th className={TH}>Client type</th>}
            {show('segment') && <th className={TH}>Segment</th>}
            {show('source') && <th className={TH}>Source</th>}
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ client, metrics, status, days }) => {
            const primary = primaryContact(client.contacts);
            const numbers = contactNumbers(client.contacts);
            const gsts = gstNumbers(client.gsts);
            const temp = currentTemperature(client.interactions);
            const since = sinceLabel(metrics.lastOrderPlaced, today);
            return (
              <tr key={client.id} onClick={() => onOpen(client)} className="group border-t border-gray-100 cursor-pointer hover:bg-teal-50/40">
                {picked && (
                  <td className="pl-4" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={picked.has(client.id)} onChange={() => onPick?.(client.id)} aria-label={`Select ${client.company}`} />
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[13px] text-gray-900">{client.company || <span className="text-gray-300">(unnamed)</span>}</span>
                    {temp && (
                      <span className="inline-flex items-center gap-1" title="Temperature: the KAM's latest 0–10 reading of the account">
                        <span className="text-[9px] uppercase tracking-wider text-gray-400">temp</span>
                        <TemperatureChip value={temp.value} at={temp.at} />
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {[client.clientType, client.segment && `Segment ${client.segment}`].filter(Boolean).join(' · ') || 'Type and segment not set'}
                  </div>
                </td>
                {show('contact') && <td className="px-3 py-2.5">
                  <div className="text-gray-700 truncate max-w-[220px]">{contactLabel(primary) || <span className="text-gray-300">No name</span>}</div>
                  <div className="font-mono text-[11px] text-gray-500 mt-0.5 whitespace-nowrap">
                    {primary?.number ? fmtPhone(primary.number) : <span className="text-amber-600 font-sans">no number</span>}
                    <More n={numbers.length - 1} />
                  </div>
                </td>}
                {show('gst') && <td className="px-3 py-2.5 whitespace-nowrap">
                  {gsts.length
                    ? <span className="font-mono text-[11px] text-gray-600">{fmtGst(gsts[0])}<More n={gsts.length - 1} /></span>
                    : <span className="text-[11px] text-gray-300">No GST</span>}
                </td>}
                {show('orders') && <td className="px-3 py-2.5 text-right font-mono text-gray-700"><Metric value={metrics.orders} state={metrics.dateState} /></td>}
                {show('enquiries') && <td className="px-3 py-2.5 text-right font-mono text-gray-700"><Metric value={metrics.enquiries} state={metrics.dateState} /></td>}
                {show('revenue') && <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-900 whitespace-nowrap"><Metric value={metrics.totalRevenue} state={metrics.dateState} format={fmtShortINR} /></td>}
                {show('avgOrder') && <td className="px-3 py-2.5 text-right font-mono text-gray-700 whitespace-nowrap"><Metric value={metrics.averageOrderValue} state={metrics.dateState} format={fmtShortINR} /></td>}
                {show('openCarts') && <td className="px-3 py-2.5 text-right font-mono text-gray-700 whitespace-nowrap"><Metric value={metrics.openValue} state={metrics.dateState} format={fmtShortINR} /></td>}
                {show('lastOrder') && <td className="px-3 pl-5 py-2.5 whitespace-nowrap">
                  {metrics.dateState === 'no-orders'
                    ? <span className="text-gray-400">Never ordered</span>
                    : (
                      <>
                        <div className="text-gray-700"><Metric value={metrics.lastOrderPlaced ? fmtDate(metrics.lastOrderPlaced) : undefined} state={metrics.dateState} /></div>
                        {since && (
                          <div
                            className={`text-[10.5px] mt-0.5 ${since === 'future date, not counted' ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}
                            title={since === 'future date, not counted' ? 'Django served a last order date after today, which cannot be a real order. The firm reads Status unknown until Django serves the real order placed date.' : undefined}
                          >
                            {since}
                          </div>
                        )}
                      </>
                    )}
                </td>}
                {show('status') && <td className="px-3 py-2.5">
                  <StatusPill status={status} days={days} />
                </td>}
                {show('studio') && <td className="px-3 py-2.5 whitespace-nowrap"><StudioCell client={client} studio={studio} /></td>}
                {show('kam') && <td className="px-3 py-2.5 whitespace-nowrap">
                  <KamCell client={client} />
                </td>}
                {show('inboundSpoc') && <td className={TEXT}><SpocCell role="inbound" spocs={spocs.get(client.id)} source={spocSource} /></td>}
                {show('outreachSpoc') && <td className={TEXT}><SpocCell role="outreach" spocs={spocs.get(client.id)} source={spocSource} /></td>}
                {show('ecSpoc') && <td className={TEXT}><SpocCell role="ec" spocs={spocs.get(client.id)} source={spocSource} /></td>}
                {show('clientType') && <td className={TEXT}>{client.clientType || <span className="text-gray-300">—</span>}</td>}
                {show('segment') && <td className={TEXT}>{client.segment || <span className="text-gray-300">—</span>}</td>}
                {show('source') && <td className={TEXT}>{client.source || <span className="text-gray-300">—</span>}</td>}
                <td className="pr-3 text-gray-300 group-hover:text-[#0F766E] text-[14px]">›</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
