'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { sbGet } from './siteAuditShared';

function todayStr(d: Date) {
  const z = (n: number) => (n < 10 ? '0' + n : n);
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}

type Ord = { pi: any; addr: string; slot: any; slotH: number; done: boolean };
type Profile = {
  name?: string;
  email: string;
  role?: string;
  last_lat?: number | null;
  last_lng?: number | null;
  last_loc_at?: string | null;
  last_order_pi?: any;
};
type State = {
  loading: boolean;
  error: boolean;
  workers: Profile[];
  wOrds: Record<string, Ord[]>;
};

export default function SiteAuditLiveView() {
  const [state, setState] = useState<State>({ loading: true, error: false, workers: [], wOrds: {} });
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const ts = todayStr(new Date());
      const [aOrds, iOrds, allProfs] = await Promise.all([
        sbGet(
          'audit_orders?select=pi,addr,slot,auditor_email,status&date=eq.' +
            ts +
            '&status=not.in.(deleted,slot_reserved,slot_converted)'
        ),
        sbGet(
          'install_orders_slim?select=pi,addr,subjobs,status&status=not.in.(deleted,pending,deliv_ontime,deliv_delayed)'
        ),
        sbGet(
          'profiles?select=name,email,role,last_lat,last_lng,last_loc_at,last_order_pi&role=in.(site_auditor,installer,auditor_installer)'
        ),
      ]);
      if (!alive) return;
      if (!Array.isArray(allProfs)) {
        setState({ loading: false, error: true, workers: [], wOrds: {} });
        return;
      }
      const profMap: Record<string, Profile> = {};
      for (const p of allProfs) profMap[p.email] = p;
      const wOrds: Record<string, Ord[]> = {};
      const addOrd = (email: string | undefined, e: Ord) => {
        if (!email) return;
        if (!wOrds[email]) wOrds[email] = [];
        wOrds[email].push(e);
      };
      const parseSlotH = (s: any) => {
        if (!s) return 99;
        const r = String(s).match(/^(\d{1,2}):(\d{2})$/);
        return r ? +r[1] + +r[2] / 60 : 99;
      };
      if (Array.isArray(aOrds)) {
        for (const o of aOrds) {
          addOrd(o.auditor_email, {
            pi: o.pi,
            addr: o.addr || '',
            slot: o.slot,
            slotH: parseSlotH(o.slot),
            done: o.status === 'completed',
          });
        }
      }
      if (Array.isArray(iOrds)) {
        for (const o of iOrds) {
          for (const sj of o.subjobs || []) {
            for (const a of sj.assignments || []) {
              const dates = a.dates || (a.date ? [a.date] : []);
              if (!dates.includes(ts)) continue;
              const slot = (a.slots && a.slots[0]) || sj.slot || null;
              addOrd(a.installer_email, {
                pi: o.pi,
                addr: o.addr || '',
                slot,
                slotH: parseSlotH(slot),
                done: ['completed', 'partial'].includes(sj.status),
              });
            }
          }
        }
      }
      for (const e of Object.keys(wOrds)) wOrds[e].sort((a, b) => a.slotH - b.slotH);
      const todayEmails = Object.keys(wOrds);
      const workers = todayEmails.map((e) => profMap[e]).filter(Boolean);
      workers.sort((a, b) => {
        const aHasLoc = !!a.last_lat,
          bHasLoc = !!b.last_lat;
        if (aHasLoc !== bHasLoc) return aHasLoc ? -1 : 1;
        if (a.last_loc_at && b.last_loc_at) return +new Date(b.last_loc_at) - +new Date(a.last_loc_at);
        return 0;
      });
      setState({ loading: false, error: false, workers, wOrds });
    }
    load();
    const t = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(t);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const { workers, wOrds } = state;
  const workerCN = (email: string) => {
    const ords = wOrds[email] || [];
    const inc = ords.filter((o) => !o.done);
    return { cur: inc[0] || null, nxt: inc[1] || null };
  };
  const ago = (d?: string | null) => {
    if (!d) return '—';
    const s = Math.round((Date.now() - +new Date(d)) / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    return Math.floor(s / 3600) + 'h ago';
  };
  const trA = (a?: string) => ((a || '').length > 45 ? a!.slice(0, 45) + '…' : a || '—');
  const fmtSlot = (s: any) => {
    if (!s) return '—';
    const r = String(s).match(/^(\d{1,2}):(\d{2})$/);
    if (!r) return s;
    const h = +r[1],
      mn = +r[2],
      ap = h >= 12 ? 'PM' : 'AM',
      h12 = h % 12 || 12;
    return h12 + ':' + (mn < 10 ? '0' : '') + mn + ' ' + ap;
  };

  useEffect(() => {
    if (state.loading || state.error) return;
    const escH = (s?: string) =>
      (s || '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));
    const mkIcon = (name: string) =>
      L.divIcon({
        className: '',
        html: `<div style="text-align:center;display:inline-block"><svg width="22" height="32" viewBox="0 0 24 36" style="display:block;margin:0 auto"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#2E6CA8"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg><div style="background:rgba(31,58,95,0.92);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap;margin-top:2px;box-shadow:0 1px 4px rgba(0,0,0,0.25)">${name}</div></div>`,
        iconSize: [80, 52],
        iconAnchor: [40, 32],
      });
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    if (!mapDivRef.current) return;
    const gpsWorkers = workers.filter((w) => w.last_lat && w.last_lng);
    if (gpsWorkers.length) {
      try {
        const center: [number, number] = [gpsWorkers[0].last_lat as number, gpsWorkers[0].last_lng as number];
        const lmap = L.map(mapDivRef.current, { zoomControl: true }).setView(center, 13);
        mapRef.current = lmap;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 18,
        }).addTo(lmap);
        gpsWorkers.forEach((w) => {
          const { cur } = workerCN(w.email);
          const nm = escH(w.name || w.email.split('@')[0]);
          L.marker([w.last_lat as number, w.last_lng as number], { icon: mkIcon(nm) })
            .bindPopup(
              `<b>${w.name || w.email}</b><br>${cur ? 'Order: ' + cur.pi + '<br>' : ''}${
                cur && cur.addr ? cur.addr + '<br>' : ''
              }${ago(w.last_loc_at)}`
            )
            .addTo(lmap);
        });
        if (gpsWorkers.length > 1) {
          const grp = L.featureGroup(
            gpsWorkers.map((w) => L.marker([w.last_lat as number, w.last_lng as number]))
          );
          lmap.fitBounds(grp.getBounds().pad(0.3));
        }
      } catch (e) {}
    } else {
      try {
        const lmap = L.map(mapDivRef.current).setView([12.9716, 77.5946], 11);
        mapRef.current = lmap;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
        }).addTo(lmap);
      } catch (e) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (state.loading)
    return (
      <div className="text-gray-400 text-[13px] text-center py-8">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-[#EAB308] mx-auto"></div>
      </div>
    );
  if (state.error)
    return (
      <>
        <div className="mb-4">
          <h1 className="text-lg font-bold text-black">Live Locations</h1>
        </div>
        <div className="p-6 text-amber-600 font-semibold">
          ⚠ Location columns not yet added to the database. Run the SQL from setup instructions to enable this
          feature.
        </div>
      </>
    );

  return (
    <>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-black">Live Locations</h1>
        <p className="text-[13px] text-gray-400 mt-0.5">
          All field workers with orders today — auto-refreshes every 30 seconds.
        </p>
      </div>
      <div
        ref={mapDivRef}
        style={{
          height: 380,
          borderRadius: 14,
          overflow: 'hidden',
          margin: '0 0 20px',
          border: '1px solid var(--line)',
          background: '#e8eaed',
        }}
      ></div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">
                Worker
              </th>
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">
                Address
              </th>
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">
                Last seen
              </th>
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">
                Order
              </th>
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">
                Current start
              </th>
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">
                Next start
              </th>
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap"></th>
            </tr>
          </thead>
          <tbody>
            {workers.length ? (
              workers.map((w, i) => {
                const { cur, nxt } = workerCN(w.email);
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-[13px] border-t border-gray-100 font-bold">
                      {w.name || w.email}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] border-t border-gray-100 text-gray-400 text-xs">
                      {trA(cur ? cur.addr : '')}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-[13px] border-t border-gray-100 ${
                        w.last_lat ? 'text-gray-400' : 'text-red-500'
                      }`}
                    >
                      {w.last_lat ? ago(w.last_loc_at) : 'Not sharing'}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] border-t border-gray-100">
                      {cur ? cur.pi : w.last_order_pi || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] border-t border-gray-100 text-gray-400">
                      {cur ? fmtSlot(cur.slot) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] border-t border-gray-100 text-gray-400">
                      {nxt ? fmtSlot(nxt.slot) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] border-t border-gray-100">
                      {w.last_lat ? (
                        <a
                          href={`https://maps.google.com/?q=${w.last_lat},${w.last_lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 font-semibold no-underline hover:underline"
                        >
                          📍 Open
                        </a>
                      ) : (
                        <span className="text-gray-400 text-xs">No GPS</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="px-3 py-7 text-[13px] border-t border-gray-100 text-center text-gray-400">
                  No field workers have orders scheduled for today.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
