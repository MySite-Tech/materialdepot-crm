'use client';

import { WpRow } from '../../coe-ops/wpTrack';
import { DealsResult, FUNNEL_PHONE_CAP, FUNNEL_STEPS, Funnel, FunnelStepKey, funnelChip, funnelFor } from '../../data/conversionFunnel';
import { fmtDateA, phoneKey } from '../../siteAuditShared';
import { OwnedInstall } from '../ownedOrders';
import { Order } from '../../types/bm-view';
import { auditAnchor } from '../../utils/bm-view';

export function buildFunnels(
  orders: Order[],
  deals: DealsResult | null,
  installs: OwnedInstall[],
  wallpapers: WpRow[],
): Map<string, Funnel> {
  const installByPhone = new Map<string, OwnedInstall[]>();
  for (const i of installs) {
    const k = phoneKey(i.phone);
    if (!k) continue;
    const list = installByPhone.get(k);
    if (list) list.push(i); else installByPhone.set(k, [i]);
  }
  const wpByPhone = new Map<string, WpRow[]>();
  for (const w of wallpapers) {
    const k = phoneKey(w.phone);
    if (!k) continue;
    const list = wpByPhone.get(k);
    if (list) list.push(w); else wpByPhone.set(k, [w]);
  }

  const out = new Map<string, Funnel>();
  for (const o of orders) {
    const key = phoneKey(o.phone);
    const anchor = auditAnchor(o);
    const since = (d: string | null | undefined) => !anchor || (!!d && String(d).slice(0, 10) >= anchor);

    const candidates = (installByPhone.get(key) || []).filter((i) => since(i.createdAt));

    const install = candidates.find((i) => i.status === 'completed')
      || candidates.slice().sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))[0]
      || null;
    const wpRun = (wpByPhone.get(key) || []).find((w) => since(w.order_placed_at || w.created_at)) || null;

    const journeyPlaced = o.journey.filter((e) => e.stage === 'order_placed')
      .sort((a, b) => String(a.ts).localeCompare(String(b.ts)))[0] || null;
    const declared = o.coePlaced || (journeyPlaced ? { at: journeyPlaced.ts, ref: journeyPlaced.refId || '' } : null);

    out.set(o.id, funnelFor({
      auditDate: anchor,
      auditCompleted: o.status === 'completed',
      auditCompletedAt: o.date,

      deals: key ? (deals ? deals.byPhone.get(key) ?? null : null) : null,
      install: install ? { pi: install.pi, createdAt: install.createdAt, status: install.status } : null,
      wpRun: wpRun ? { pi: wpRun.pi || wpRun.md_id || '', placedAt: wpRun.order_placed_at || wpRun.created_at || null } : null,
      declaredOrderAt: declared?.at || null,
      declaredOrderRef: declared?.ref || '',
    }));
  }
  return out;
}

export function stallCounts(funnels: Map<string, Funnel>): { lost: number; byStep: Record<string, number>; done: number; unknown: number } {
  const byStep: Record<string, number> = {};
  let lost = 0;
  let done = 0;
  let unknown = 0;
  for (const f of funnels.values()) {
    if (f.lost) { lost++; continue; }

    if (f.unknownFrom) { unknown++; continue; }
    if (!f.stalledAt) { done++; continue; }
    byStep[f.stalledAt.k] = (byStep[f.stalledAt.k] || 0) + 1;
  }
  return { lost, byStep, done, unknown };
}

export function ConversionStrip({ total, stalls, active, onPick, loading, deals }: {
  total: number;
  stalls: ReturnType<typeof stallCounts>;
  active: 'all' | 'lost' | 'unknown' | FunnelStepKey;
  onPick: (v: 'all' | 'lost' | 'unknown' | FunnelStepKey) => void;
  loading: boolean;
  deals: DealsResult | null;
}) {
  if (!total) return null;

  const tiles = FUNNEL_STEPS.filter((st) => stalls.byStep[st.k]);

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500">Where the client stopped</span>
        <span className="text-[11.5px] text-gray-400">
          After the audit: cart → quotation → order → installation. Cart, quotation and order come from this
          client&apos;s own CRM deals, raised on or after the audit.
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onPick('all')}
          className={active === 'all' ? 'rounded-full bg-[#1A1A1A] px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600'}
        >
          All ({total})
        </button>
        {tiles.map((st) => (
          <button
            key={st.k}
            title={st.hint}
            onClick={() => onPick(st.k)}
            className={active === st.k ? 'rounded-full bg-[#1A1A1A] px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600'}
          >
            Waiting on {st.short.toLowerCase()} ({stalls.byStep[st.k]})
          </button>
        ))}
        {stalls.lost ? (
          <button
            onClick={() => onPick('lost')}
            className={active === 'lost' ? 'rounded-full bg-[#1A1A1A] px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700'}
          >
            Lost / cancelled ({stalls.lost})
          </button>
        ) : null}
        {stalls.unknown ? (
          <button
            title="The CRM deal pipeline couldn't be read for these clients, so cart / quotation / order are unknown — not absent."
            onClick={() => onPick('unknown')}
            className={active === 'unknown' ? 'rounded-full bg-[#1A1A1A] px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-500'}
          >
            Pipeline unknown ({stalls.unknown})
          </button>
        ) : null}
        {stalls.done ? (
          <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
            Installed ({stalls.done})
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-1.5 text-[11.5px] text-gray-400">Reading the CRM pipeline for these clients…</div>
      ) : null}

      {deals?.allFailed ? (
        <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
          Couldn&apos;t read the CRM deal pipeline, so cart / quotation / order are unknown below — not absent. The
          audit and installation steps are unaffected.
        </div>
      ) : null}
      {deals?.skipped ? (
        <div className="mt-1.5 text-[11.5px] text-amber-700">
          Cart and quotation were looked up for the first {FUNNEL_PHONE_CAP} clients only — {deals.skipped} more are
          shown with audit and installation steps alone. Filter or search to check them.
        </div>
      ) : null}
    </div>
  );
}

export function FunnelRowChip({ f }: { f?: Funnel }) {
  if (!f) return null;
  const chip = funnelChip(f);
  return (
    <div className="mt-1">
      <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${chip.badge}`}>{chip.label}</span>
    </div>
  );
}

export function ConversionLadder({ f, phone, onRecheck }: { f?: Funnel; phone: string; onRecheck: () => void }) {
  if (!f) return <div className="text-[12.5px] text-gray-400">Working out where this client got to…</div>;

  return (
    <>
      {f.lost ? (
        <div className="mb-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          <b>Marked {f.lost.status.toLowerCase()} in the CRM{f.lost.reason ? ' — ' + f.lost.reason : ''}.</b>
          {f.lost.at ? <span className="text-red-600"> ({fmtDateA(String(f.lost.at).slice(0, 10))})</span> : null}
        </div>
      ) : f.unknownFrom ? (
        <div className="mb-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[12.5px] text-gray-600">
          <b>Can&apos;t tell yet — {f.unknownFrom.label.toLowerCase()} couldn&apos;t be checked.</b> This is a gap in the
          data, not a client who went quiet.
        </div>
      ) : f.stalledAt ? (
        <div className="mb-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
          <b>Waiting on: {f.stalledAt.label}.</b> {f.stalledAt.hint}
        </div>
      ) : (
        <div className="mb-2.5 rounded-lg bg-green-50 px-3 py-2 text-[12.5px] font-bold text-green-700">
          ✓ Audit → order → installation, all the way through.
        </div>
      )}

      {f.steps.map((st) => (
        <div key={st.k} className="flex gap-2.5 py-1.5">
          {st.state === 'done' ? (
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#1f7a3f] text-[9px] font-extrabold text-white">✓</span>
          ) : st.state === 'implied' ? (
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 border-[#1f7a3f] text-[9px] font-extrabold text-[#1f7a3f]">✓</span>
          ) : st.state === 'unknown' ? (
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 border-gray-300 text-[9px] font-extrabold text-gray-400">?</span>
          ) : (
            <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${f.stalledAt?.k === st.k ? 'border-amber-500' : 'border-gray-200'}`} />
          )}
          <div className="min-w-0 flex-1">
            <div className={`text-[12.5px] ${st.state !== 'pending' || f.stalledAt?.k === st.k ? 'font-bold' : ''} ${st.state !== 'pending' ? 'text-gray-900' : f.stalledAt?.k === st.k ? 'text-[#1F3A5F]' : 'text-gray-400'}`}>
              {st.label}
            </div>
            {st.at ? <div className="text-[11px] text-gray-400">{fmtDateA(String(st.at).slice(0, 10))}{st.ref ? ' · ' + st.ref : ''}</div> : null}
            {st.detail ? <div className="mt-0.5 text-[11.5px] text-gray-500">{st.detail}</div> : null}
          </div>
        </div>
      ))}

      {f.value ? (
        <div className="mt-2 text-[12px] text-gray-500">Cart value across these deals: <b className="text-gray-900">₹{f.value.toLocaleString('en-IN')}</b></div>
      ) : null}
      {f.priorDeals ? (
        <div className="mt-1.5 border-l-2 border-gray-200 pl-2 text-[11.5px] text-gray-400">
          {f.priorDeals} earlier {f.priorDeals === 1 ? 'enquiry' : 'enquiries'} on {phone || 'this number'}, raised before
          this audit. Not counted — an older order can&apos;t be this audit&apos;s conversion.
        </div>
      ) : null}
      {!f.pipelineKnown ? (
        <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
          The CRM deal pipeline couldn&apos;t be read for this client, so cart / quotation / order above are unknown
          rather than absent.
        </div>
      ) : null}
      <button className="mt-2 text-[12px] font-semibold text-blue-700" onClick={onRecheck}>
        Re-check the CRM pipeline for this client
      </button>
    </>
  );
}
