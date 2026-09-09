'use client';

import { JourneyEntry } from '../../../data/audit-registry';
import { Funnel } from '../../../data/conversion-funnel';
import { fmtDateA, fmtLog, sbGet } from '../../../shared';
import { AuditRoomCard } from '../../../ui/audit-room-views';
import LinkInstallSection from '../../../ui/link-install-section';
import RoomSkuEditor, { auditRoomSkuSaver } from '../../../ui/room-sku-editor';
import { DrawerShell, KV, Sec } from '../../../ui/drawer-ui';
import { STATUS } from '../constants';
import { ConversionLadder } from './funnels';
import { JourneyAddForm, JourneyTimeline } from './journey';
import { MaterialSection } from './materials';
import { BmProfile, Order } from '../types';
import { Fragment, useCallback, useEffect, useState } from 'react';

export function BmOrderDrawer({ order: o, bm, funnel, onRecheck, onClose }: { order: Order; bm: BmProfile; funnel?: Funnel; onRecheck: () => void; onClose: () => void }) {
  const [ticked, setTicked] = useState<any>(null);
  const [jcLoading, setJcLoading] = useState(o.status === 'completed');
  const [journey, setJourney] = useState<JourneyEntry[] | null>(null);
  const [msg, setMsg] = useState('');

  const loadCard = useCallback(async () => {
    const rows = await sbGet('audit_orders?id=eq.' + o.id + '&select=audit_ticked');
    setTicked(Array.isArray(rows) && rows[0] ? rows[0].audit_ticked : null);
    setJcLoading(false);
  }, [o.id]);
  const loadJourney = useCallback(async () => {
    const rows = await sbGet('audit_orders?id=eq.' + o.id + '&select=bm_journey');
    setJourney(Array.isArray(rows) && rows[0] && Array.isArray(rows[0].bm_journey) ? rows[0].bm_journey : []);
  }, [o.id]);

  useEffect(() => {
    if (o.status === 'completed') loadCard();
    loadJourney();
  }, [o.status, loadCard, loadJourney]);

  const rooms = (ticked && Array.isArray(ticked.rooms) && ticked.rooms) || [];
  const isDraft = ticked && ticked.draft && !(ticked.sign && !ticked.sign.draft);

  return (
    <DrawerShell
      title={o.name || '—'}
      subtitle={<>{o.pi} · {(STATUS[o.status] || { l: o.status }).l}</>}
      onClose={onClose}
      footer={msg ? <div className="border-t border-gray-100 bg-green-50 px-5 py-2 text-[12.5px] font-semibold text-green-700">{msg}</div> : null}
    >
      <Sec title="Customer">
        <KV k="Phone" v={<a className="text-blue-600" href={'tel:' + o.phone.replace(/\s/g, '')}>{o.phone || '—'}</a>} />
        <KV k="Address" v={o.addr ? <a className="text-blue-600" href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.addr)} target="_blank" rel="noopener noreferrer">{o.addr}</a> : '—'} />
        <KV k="Date" v={o.date ? fmtDateA(o.date) : '—'} />
        <KV k="Auditor" v={o.auditorName || '—'} />
        <KV k="Enquiry ID" v={(o.po && o.po[0]) || '—'} />
      </Sec>

      <Sec title="Timeline">
        {o.log && o.log.length ? o.log.slice().reverse().map((l: any, i: number) => (
          <div key={i} className="border-b border-gray-100 py-2 last:border-b-0">
            <div className="text-[13px] font-semibold text-gray-900">{l.who ? <b className="text-[#1F3A5F]">{l.who}</b> : null}{l.who ? ' · ' : ''}{l.t || ''}</div>
            <div className="mt-0.5 text-[11.5px] text-gray-400">{fmtLog(l.d)}{l.by ? ' · ' + (l.by === 'auto' ? 'system' : l.by) : ''}</div>
          </div>
        )) : <div className="text-[12.5px] text-gray-400">No activity logged yet.</div>}
      </Sec>

      <Sec title="Job Card">
        {o.status !== 'completed' ? <div className="text-[12.5px] text-gray-400">Not available yet — the site audit has not been completed.</div>
          : jcLoading ? <div className="text-[12.5px] text-gray-400">Loading…</div>
            : !rooms.length ? <div className="text-[12.5px] text-gray-400">No job card details recorded.</div>
              : (
                <>
                  {isDraft
                    ? <div className="mb-2.5 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] font-bold text-amber-800">⚠️ Job card is still a draft — not yet signed off by the client.</div>
                    : ticked.sign ? <div className="mb-2.5 rounded-lg bg-green-50 px-3 py-2 text-[12.5px] font-bold text-green-700">✓ Signed off by the client{ticked.sign.name ? ' — ' + ticked.sign.name : ''}</div> : null}
                  {rooms.map((r: any, i: number) => (
                    <Fragment key={i}>
                      <AuditRoomCard room={r} index={i} />

                      <RoomSkuEditor
                        room={r}
                        save={auditRoomSkuSaver(String(o.id), i, (bm.name || 'BM') + ' (BM)')}
                        onSaved={() => { setMsg('Room SKU saved'); loadCard(); }}
                      />
                      <MaterialSection room={r} roomIdx={i} orderId={o.id} bm={bm} onSaved={(m) => { setMsg(m); loadCard(); }} />
                    </Fragment>
                  ))}
                </>
              )}
      </Sec>

      <Sec title="Linked Installation">
        <LinkInstallSection
          auditPi={o.pi}
          auditPhone={o.phone}
          attribution={(bm.name || 'BM') + ' (BM)'}
          onMsg={setMsg}
        />
      </Sec>

      <Sec title="Did it convert?">
        <ConversionLadder f={funnel} phone={o.phone} onRecheck={onRecheck} />
      </Sec>

      <Sec title="Customer Journey">
        <JourneyTimeline entries={journey} />
        <JourneyAddForm entries={journey || []} orderId={o.id} bm={bm} onSaved={(m) => { setMsg(m); loadJourney(); }} />
      </Sec>
    </DrawerShell>
  );
}
