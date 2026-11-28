'use client';

import type { DailyCard } from '@/lib/api/crm/am-checklist';
import { rupeesShort, weekdayDayMonth } from './format';

function Tile({ label, value, valueTone = 'text-gray-800', hint, children }: {
  label: string;
  value?: string;
  valueTone?: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 rounded-xl px-3.5 py-3">
      <div className="flex justify-between items-baseline">
        <span className="text-[12px] font-bold tracking-wide uppercase text-gray-600">{label}</span>
        {value !== undefined && <b className={`text-[18px] ${valueTone}`}>{value}</b>}
      </div>
      {children}
      {hint && <p className="text-[12px] text-gray-500 mt-1.5">{hint}</p>}
    </div>
  );
}

function Bar({ pct, tone = 'bg-red-700', tick }: { pct: number; tone?: string; tick?: number }) {
  return (
    <div className="relative h-2 bg-gray-100 rounded-full mt-2">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
      {tick !== undefined && <div className="absolute -top-1 -bottom-1 w-0.5 bg-gray-700" style={{ left: `${Math.min(100, tick)}%` }} />}
    </div>
  );
}

export function BmDailyCard({ card, name }: { card: DailyCard; name: string }) {
  const t = card.today;
  const share = (s: { count: number; of: number; pct: number | null }) =>
    s.of === 0 ? '–' : `${s.count}/${s.of}`;
  const rq = t.remark_quality;
  const oc = card.ordered_clients;
  const g = card.grooming;
  const mtd = card.month_to_date;
  const month = new Date(`${card.date}T00:00:00`).toLocaleDateString('en-IN', { month: 'short' });

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200">
      <div className="bg-[#1B2332] text-white px-5 py-4 flex justify-between items-center gap-3 border-b-4 border-[#F5C400]">
        <div>
          <div className="text-[11.5px] tracking-wide text-gray-300"><b className="text-[#F5C400]">MD</b> BM CARD · {weekdayDayMonth(card.date)} (so far)</div>
          <div className="text-[19px] font-bold mt-0.5">{name}</div>
        </div>
        <div className="bg-[#F5C400] text-[#1B2332] rounded-xl px-4 py-2 text-center">
          <div className="text-[26px] font-extrabold leading-none">{t.clients_attended}</div>
          <div className="text-[10.5px] font-bold tracking-wide mt-1">CLIENTS ATTENDED TODAY</div>
        </div>
      </div>
      <div className="p-4 grid grid-cols-2 gap-3 bg-white">
        <Tile label="Carts created" value={share(t.carts_created)} hint={t.clients_attended ? undefined : 'no clients attended'}>
          <Bar pct={t.carts_created.pct ?? 0} tone="bg-emerald-600" />
        </Tile>
        <Tile label="CRM remarks" value={share(t.crm_remarks)} hint={t.clients_attended ? undefined : 'no clients with a CRM lead'}>
          <Bar pct={t.crm_remarks.pct ?? 0} tone="bg-emerald-600" />
        </Tile>
        <div className="col-span-2">
          <Tile
            label="Remark quality"
            value={rq.avg == null ? '–' : `${rq.avg.toFixed(1)}/${rq.out_of}`}
            valueTone={rq.avg != null && rq.avg >= 3.5 ? 'text-emerald-700' : 'text-red-700'}
            hint="Need · Stuck · Who · Next + date"
          >
            <Bar pct={((rq.avg ?? 0) / rq.out_of) * 100} tone={rq.avg != null && rq.avg >= 3.5 ? 'bg-emerald-600' : 'bg-red-700'} />
          </Tile>
        </div>
        <Tile
          label="Grooming"
          value={g?.scored ? `${g.score}/${g.out_of}` : '–'}
          valueTone={g?.scored && g.score === g.out_of ? 'text-emerald-700' : 'text-red-700'}
          hint={`AM's ${g?.out_of ?? 6}-point check`}
        />
        <Tile label="Orders today" value={String(t.orders)} hint={rupeesShort(t.revenue)} />
        <div className="col-span-2">
          <Tile
            label={`Ordered clients · ${month} so far`}
            value={`${oc.count} / ${oc.target}`}
            valueTone={oc.count >= oc.expected_by_today ? 'text-emerald-700' : 'text-red-700'}
            hint={`tick = where we should be today (${oc.expected_by_today})`}
          >
            <Bar
              pct={oc.target ? (oc.count / oc.target) * 100 : 0}
              tone={oc.count >= oc.expected_by_today ? 'bg-emerald-600' : 'bg-red-700'}
              tick={oc.target ? (oc.expected_by_today / oc.target) * 100 : undefined}
            />
          </Tile>
        </div>
        <div className="col-span-2 border border-gray-200 rounded-xl px-3.5 py-3">
          <span className="text-[12px] font-bold tracking-wide uppercase text-gray-600">Follow-ups</span>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {([['overdue', card.followups.overdue, 'text-emerald-700'], ['due today', card.followups.due_today, 'text-red-700'], ['upcoming', card.followups.upcoming, 'text-gray-800']] as const).map(([label, n, tone]) => (
              <div key={label} className="bg-gray-50 rounded-lg py-2 text-center">
                <b className={`block text-[20px] ${label === 'overdue' && n > 0 ? 'text-red-700' : tone}`}>{n}</b>
                <span className="text-[12px] text-gray-600">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="col-span-2 bg-amber-50 rounded-xl px-3.5 py-3">
          <span className="text-[12px] font-bold tracking-wide uppercase text-gray-600">{month} so far (MTD)</span>
          <div className="grid grid-cols-4 gap-2 mt-2 text-center">
            {([[rupeesShort(mtd.revenue), 'Revenue'], [String(mtd.orders), 'Orders'], [mtd.aov ? rupeesShort(mtd.aov) : '–', 'AOV'], [String(mtd.footfall), 'Footfall']] as const).map(([v, l]) => (
              <div key={l}><b className="block text-[17px]">{v}</b><span className="text-[12px] text-gray-600">{l}</span></div>
            ))}
          </div>
        </div>
      </div>
      <p className="px-4 pb-3 bg-white text-[11.5px] text-gray-400">
        Auto from the CRM · today so far, pulled {new Date(card.server_time_ist).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST. Same numbers as the BM&apos;s app.
      </p>
    </div>
  );
}
