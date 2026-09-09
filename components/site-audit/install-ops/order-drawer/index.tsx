'use client';

import { useNoteModal } from '../../hooks/use-note-modal';

import { typeLabel, typeTag } from '../../data/audit-registry';
import { sbPatch } from '../../shared';
import AssignSection from '../ui/assign-section';
import { AUTO_STATUSES, STATUS, dstr, emptySkuRow, fmtDate, fmtLogLocal, isSplit, mintSubjobId, opsCallDue, sjCustomWp, sjDeliveryDate, sjShortLabel, slotsForWp, subjobDisplayStatus, syncParentStatus, today, totalRolls } from '../shared';
import { InstallCategory, ServiceSkuRow, Subjob } from '../types';
import { Chip, MapLink, Note, sjTypeClass } from '../ui';
import { SJ_ID } from './constants';
import { FieldDate, KV, ReadonlyField, Section } from './sections/fields';
import { DownloadJobCardBtn } from './sections/jobcard';
import { SkuGroup } from './sections/skus';
import { SjDeliveryRow, SplitPicker, SubjobCrewProgress } from './sections/subjobs';
import { DraftState, Props } from './types';
import { buildInitDraft } from './utils';
import { useState } from 'react';

export default function OrderDrawer({ order: o, allOrders, installers, shadowerPool, city, slotsFl, slotsWp, attribution, installersErr, onRetryInstallers, onClose, onOpenOrder, onOpenRect, reload, reloadWithDeleted, toast }: Props) {
  const [draft, setDraft] = useState<DraftState>(() => buildInitDraft(o));
  const [splitSjId, setSplitSjId] = useState<string | null>(null);
  const [grpOn, setGrpOn] = useState(() => { const d = buildInitDraft(o); return { flooring: d.flooring.length > 0, wallpaper: d.wallpaper.length > 0, wallpanel: d.wallpanel.length > 0 }; });
  const [newDeliv, setNewDeliv] = useState(o.deliveryDate || '');
  const [fuDate, setFuDate] = useState((o.service && o.service.follow_up_date) || '');
  const [custOpen, setCustOpen] = useState(false);
  const [custName, setCustName] = useState(o.name || '');
  const [custPhone, setCustPhone] = useState(o.phone || '');
  const [custAddr, setCustAddr] = useState(o.addr || '');
  const { ask: askNote, modal: noteModal } = useNoteModal();

  function updateDraftField(grp: InstallCategory, i: number, f: keyof ServiceSkuRow, v: string) {
    setDraft((d) => ({ ...d, [grp]: d[grp].map((r, ri) => (ri === i ? { ...r, [f]: v } : r)) }));
  }
  function delDraftRow(grp: InstallCategory, i: number) {
    setDraft((d) => ({ ...d, [grp]: d[grp].filter((_, ri) => ri !== i) }));
  }
  function addDraftRow(grp: InstallCategory) {
    setDraft((d) => ({ ...d, [grp]: [...d[grp], emptySkuRow(grp) as ServiceSkuRow] }));
  }
  function toggleGrp(grp: InstallCategory) {
    const on = !grpOn[grp];
    setGrpOn((g) => ({ ...g, [grp]: on }));
    if (on) setDraft((d) => (d[grp].length === 0 ? { ...d, [grp]: [emptySkuRow(grp) as ServiceSkuRow] } : d));
    else setDraft((d) => ({ ...d, [grp]: [] }));
  }

  async function persist(patch: Record<string, any>, toastMsg?: string, reopen = true, failMsg?: string): Promise<boolean> {
    try {
      if (o.id) await sbPatch('install_orders', String(o.id), patch);
    } catch (e: any) {
      toast(failMsg || 'Could not save — ' + (e?.message || 'try again'));
      return false;
    }
    await reload();
    if (toastMsg) toast(toastMsg);
    if (reopen) onOpenOrder(o.pi);
    return true;
  }

  const saveCustomer = async () => {
    const nm = custName.trim(), ph = custPhone.trim(), ad = custAddr.trim();
    if (!nm || !ph || !ad) { toast('Name, phone and address are all required'); return; }
    const changed: string[] = [];
    if (nm !== (o.name || '')) changed.push('name');
    if (ph !== (o.phone || '')) changed.push('phone');
    if (ad !== (o.addr || '')) changed.push('address');
    if (!changed.length) { toast('No changes to save'); return; }
    const nextLog = [...o.log, { t: 'Customer details corrected — ' + changed.join(', ') + ' updated', d: new Date().toISOString(), by: 'manual' as const, who: attribution }];

    const saved = await persist({ customer_name: nm, phone: ph, addr: ad, log: nextLog }, 'Customer details updated');
    if (saved) setCustOpen(false);
  };

  const setAuditBy = async (val: 'material_depot' | 'customer') => {
    const nextService = { ...(o.service || {}), audit_by: val };
    const nextLog = [...o.log, { t: 'Site audit type: ' + (val === 'material_depot' ? 'Material Depot' : 'Customer self-audit'), d: new Date().toISOString(), by: 'manual' as const, who: attribution }];
    await persist({ service: nextService, log: nextLog }, 'Audit type saved');
  };

  const setStatus = async (st: string) => {
    if (st === o.status) return;
    let overrideReason = '';
    if (st === 'completed' && o.subjobs && o.subjobs.length) {
      const noCard = o.subjobs.filter((sj) => sj.status !== 'completed' && !(sj.jobcard && sj.jobcard.sign));
      if (noCard.length) {
        const names = noCard.map((sj) => typeLabel(sj.type)).join(', ');

        overrideReason = ((await askNote(
          'Reason for overriding without a job card (required)',
          'These sub-job(s) have NO signed job card — no photos, signature or customer rating on file: ' + names
            + '. Forcing Completed marks them done with no proof of work. Only do this if you have confirmed directly with the installer or customer.',
        )) || '').trim();
        if (!overrideReason) { toast('Reason required — status not changed'); return; }
      }
    }
    const FIELD_STATUSES = ['callpending', 'onway', 'atsite', 'completed', 'reschedule'];
    const RANK: Record<string, number> = { scheduled: 0, assigned: 0, callpending: 1, onway: 2, atsite: 3 };
    let nextSubjobs: Subjob[] | null = o.subjobs;
    if (st === 'created' && o.subjobs && o.subjobs.length) {
      nextSubjobs = o.subjobs.map((sj) => ({ ...sj, status: 'created', assignments: [], date: null, slot: null }));
    } else if (st === 'completed' && o.subjobs && o.subjobs.length) {
      nextSubjobs = o.subjobs.map((sj) => (sj.status === 'completed' ? sj : { ...sj, status: 'completed', assignments: (sj.assignments || []).map((a) => ({ ...a, status: 'completed' })) }));
    } else if (FIELD_STATUSES.includes(st) && o.subjobs && o.subjobs.length) {
      const newRank = RANK[st] ?? 99;
      nextSubjobs = o.subjobs.map((sj) => {
        if (sj.status === 'completed') return sj;
        const curRank = RANK[sj.status] ?? -1;
        if (st === 'reschedule' || curRank < newRank) return { ...sj, status: st, assignments: (sj.assignments || []).map((a) => ({ ...a, status: st })) };
        return sj;
      });
    }
    const note = await askNote('Status → ' + STATUS[st].l);
    if (note === null) return;
    const overrideNote = overrideReason ? ' · ⚠ forced Completed without job card: "' + overrideReason + '" (SM override)' : '';
    const nextLog = [...o.log, { t: 'Status set to ' + STATUS[st].l + (AUTO_STATUSES.includes(st) ? ' (manually)' : '') + overrideNote + ' — note: "' + note + '"', d: new Date().toISOString(), by: 'manual' as const, who: attribution }];
    await persist({ status: st, subjobs: nextSubjobs || null, log: nextLog }, 'Status: ' + STATUS[st].l);
  };

  const markOnTime = async () => {
    const nextLog = [...o.log, { t: 'Operations confirmed delivery on time', d: new Date().toISOString(), by: 'manual' as const, who: attribution }];
    await persist({ status: 'deliv_ontime', log: nextLog }, 'Delivery on time — create service next');
  };
  const markDelayed = async () => {
    const nd = newDeliv || o.deliveryDate;
    const wasDelayed = o.status === 'deliv_delayed';
    const nextLog = [...o.log, { t: (wasDelayed ? 'Delivery further delayed' : 'Delivery delayed — BM asked to inform client') + '. New date: ' + fmtDate(nd), d: new Date().toISOString(), by: 'manual' as const, who: attribution }];
    await persist({ status: 'deliv_delayed', delivery_date: nd, log: nextLog }, wasDelayed ? 'Delivery date updated' : 'Marked delivery delayed');
  };

  const createService = async () => {
    const fl = draft.flooring.filter((r) => r.sku || r.name), wp = draft.wallpaper.filter((r) => r.sku || r.name), wpnl = draft.wallpanel.filter((r) => r.sku || r.name);
    if (!fl.length && !wp.length && !wpnl.length) { toast('Add at least one SKU'); return; }
    const nextService = { ...(o.service || {}), flooring: fl, wallpaper: wp, wallpanel: wpnl };
    const nextSubjobs: Subjob[] = [];
    if (fl.length) nextSubjobs.push({ id: SJ_ID.flooring, type: 'flooring', items: fl, date: null, slot: null, installer: null, installer_email: null, assignments: [], status: 'created' });
    if (wp.length) nextSubjobs.push({ id: SJ_ID.wallpaper, type: 'wallpaper', items: wp, date: null, slot: null, installer: null, installer_email: null, assignments: [], status: 'created' });
    if (wpnl.length) nextSubjobs.push({ id: SJ_ID.wallpanel, type: 'wallpanel', items: wpnl, date: null, slot: null, installer: null, installer_email: null, assignments: [], status: 'created' });
    const nextLog = [...o.log, { t: 'Service created — ' + nextSubjobs.map((sj) => sj.type + ': ' + sj.items.map((i) => i.sku).join('/')).join(' | '), d: new Date().toISOString(), by: 'manual' as const, who: attribution }];
    await persist({ status: 'created', service: nextService, subjobs: nextSubjobs, log: nextLog }, 'Service created — ' + nextSubjobs.length + ' sub-job(s)');
  };

  const saveService = async () => {
    const rowsFor = (grp: InstallCategory) => draft[grp].filter((r) => r.sku || r.name);
    const CATS: InstallCategory[] = ['flooring', 'wallpaper', 'wallpanel'];
    const logAdds: Array<{ t: string; d: string; by: 'manual'; who: string }> = [];

    for (const grp of CATS) {
      const sj = o.subjobs && o.subjobs.find((s) => s.id === SJ_ID[grp]);
      if (!rowsFor(grp).length && sj && sj.status !== 'created') {
        if (!window.confirm('The ' + typeLabel(grp).toLowerCase() + ' sub-job is currently ' + (STATUS[sj.status] || { l: sj.status }).l + '. Removing it will cancel the installer\'s assignment. Proceed?')) return;
        logAdds.push({ t: typeLabel(grp) + ' sub-job removed (was ' + sj.status + ' — SM correction)', d: new Date().toISOString(), by: 'manual', who: attribution });
      }
    }
    const nextService = { ...(o.service || {}), flooring: rowsFor('flooring'), wallpaper: rowsFor('wallpaper'), wallpanel: rowsFor('wallpanel') };
    let nextSubjobs = o.subjobs ? [...o.subjobs] : null;
    if (nextSubjobs) {
      for (const grp of CATS) {
        const rows = rowsFor(grp);
        const id = SJ_ID[grp];
        const existing = nextSubjobs.find((s) => s.id === id);
        if (rows.length && existing) nextSubjobs = nextSubjobs.map((s) => (s.id === id ? { ...s, items: rows } : s));
        else if (rows.length && !existing) nextSubjobs.push({ id, type: grp, items: rows, date: null, slot: null, installer: null, installer_email: null, assignments: [], status: 'created' });
        else if (!rows.length && existing) nextSubjobs = nextSubjobs.filter((s) => s.id !== id);
      }
    }
    const nextStatus = syncParentStatus(nextSubjobs, o.status);
    const nextLog = [...o.log, ...logAdds, { t: 'Service details updated', d: new Date().toISOString(), by: 'manual' as const, who: attribution }];
    await persist({ status: nextStatus, service: nextService, subjobs: nextSubjobs, log: nextLog }, 'Service details saved');
  };

  const doSplit = async (sjId: string, movedSkus: string[]) => {
    const sj = (o.subjobs || []).find((s) => s.id === sjId);
    if (!sj) return;
    const moved = sj.items.filter((it) => movedSkus.includes(it.sku));
    const remaining = sj.items.filter((it) => !movedSkus.includes(it.sku));
    if (!moved.length || !remaining.length) return;
    const deliv = sjDeliveryDate(o, sj);
    const newSj: Subjob = {
      id: mintSubjobId(o, sj.type), type: sj.type, items: moved, assignments: [], date: null, slot: null,
      installer: null, installer_email: null, status: 'pending', deliveryDate: deliv, originalDeliveryDate: deliv,
      ...(sj.type === 'wallpaper' ? { customWp: sjCustomWp(o, sj), customWpStage: 'draft', customWpMeta: {} } : {}),
    };
    const nextSubjobs = (o.subjobs || []).map((s) => (s.id === sjId ? { ...s, items: remaining } : s)).concat([newSj]);
    const nextStatus = syncParentStatus(nextSubjobs, o.status);
    const nextLog = [...o.log, {
      t: typeLabel(sj.type) + ' split — ' + moved.length + ' SKU(s) moved to a new sub-job (' + moved.map((m) => m.sku).join(', ') + ') with its own delivery/installer',
      d: new Date().toISOString(), by: 'manual' as const, who: attribution,
    }];
    await persist({ status: nextStatus, subjobs: nextSubjobs, log: nextLog }, 'Split into separate visits', true, 'Could not save split — try again');
  };

  const doMerge = async (sjId: string) => {
    const sj = (o.subjobs || []).find((s) => s.id === sjId);
    if (!sj) return;
    if ((sj.assignments && sj.assignments.length) || sj.jobcard) { toast('Cannot merge — this sub-job already has an installer or job card'); return; }

    const target = (o.subjobs || []).filter((s) => s.type === sj.type && s.id !== sj.id).sort((a, b) => (a.id || '').localeCompare(b.id || ''))[0];
    if (!target) { toast('No sibling sub-job to merge into'); return; }
    const nextSubjobs = (o.subjobs || [])
      .filter((s) => s.id !== sj.id)
      .map((s) => (s.id === target.id ? { ...s, items: [...(s.items || []), ...(sj.items || [])] } : s));
    const nextStatus = syncParentStatus(nextSubjobs, o.status);
    const nextLog = [...o.log, {
      t: typeLabel(sj.type) + ' sub-job merged back (' + (sj.items || []).map((m) => m.sku).join(', ') + ')',
      d: new Date().toISOString(), by: 'manual' as const, who: attribution,
    }];
    await persist({ status: nextStatus, subjobs: nextSubjobs, log: nextLog }, 'Merged back', true, 'Could not merge — try again');
  };

  const saveSjDelivery = async (sjId: string, date: string) => {
    const sj = (o.subjobs || []).find((s) => s.id === sjId);
    if (!sj) return;
    const prev = sjDeliveryDate(o, sj);
    if ((date || null) === (prev || null)) { toast('No change'); return; }
    const nextSubjobs = (o.subjobs || []).map((s) => {
      if (s.id !== sjId) return s;
      const next: Subjob = { ...s };
      if (date) {
        next.deliveryDate = date;
        if (next.originalDeliveryDate === undefined) next.originalDeliveryDate = prev || null;
      } else {
        delete next.deliveryDate;
      }
      return next;
    });
    const label = date
      ? sjShortLabel(o, sj).toUpperCase() + ' delivery date set to ' + fmtDate(date) + (prev ? ' (was ' + fmtDate(prev) + ')' : '')
      : sjShortLabel(o, sj).toUpperCase() + ' delivery date cleared — follows the order date (' + fmtDate(o.deliveryDate) + ')';
    const nextLog = [...o.log, { t: label, d: new Date().toISOString(), by: 'manual' as const, who: attribution }];
    await persist({ subjobs: nextSubjobs, log: nextLog }, date ? 'Sub-job delivery updated' : 'Sub-job delivery reset', true, 'Could not save the delivery date — try again');
  };

  const setFollowUp = async () => {
    if (!fuDate) { toast('Pick a date first'); return; }
    const note = await askNote('Set follow-up to ' + fmtDate(fuDate));
    if (note === null) return;
    const nextService = { ...(o.service || {}), follow_up_date: fuDate };
    const nextLog = [...o.log, { t: 'Follow-up set · Call client by ' + fmtDate(fuDate) + ' — note: "' + note + '"', d: new Date().toISOString(), by: 'manual' as const, who: attribution }];
    await persist({ service: nextService, log: nextLog }, 'Follow-up set for ' + fmtDate(fuDate));
  };
  const clearFollowUp = async () => {
    const note = await askNote('Clear follow-up');
    if (note === null) return;
    const svc = { ...(o.service || {}) };
    delete (svc as any).follow_up_date;
    const nextLog = [...o.log, { t: 'Follow-up cleared — note: "' + note + '"', d: new Date().toISOString(), by: 'manual' as const, who: attribution }];
    await persist({ service: svc, log: nextLog }, 'Follow-up cleared');
  };

  const delOrder = async () => {
    if (!window.confirm('Move this install order to Deleted? It will be stored in the Deleted Orders section and can be restored.')) return;
    try {
      if (o.id) await sbPatch('install_orders', String(o.id), { status: 'deleted' });
      onClose();
      await reloadWithDeleted();
      toast('Order moved to Deleted');
    } catch {
      toast("Couldn't delete — try again");
    }
  };

  const dd = o.deliveryDate ? new Date(o.deliveryDate + 'T00:00') : null;
  const dleft = dd ? Math.round((dd.getTime() - today.getTime()) / 86400000) : 0;

  return (
    <>
      {noteModal}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
        <div>
          <h2 className="text-base font-bold text-gray-900">{o.name}</h2>
          <div className="text-[12px] text-gray-500 mt-1 flex items-center gap-2 flex-wrap">{o.pi} · BM {o.bm} <Chip st={o.status} /></div>
        </div>
        <button className="w-7 h-7 rounded-md bg-gray-100 text-gray-500 shrink-0" onClick={onClose}>✕</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <Section title="Order">
          <KV k="PI ID" v={o.pi} />
          <KV k="PO numbers" v={o.po.join(', ')} />
          <KV k="SKUs in cart" v={<div className="flex flex-wrap gap-1">{o.skus.map((s, i) => <span key={i} className={`inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold ${s.type === 'install' ? 'bg-green-100 text-green-800' : /CUST/.test(s.c) ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-[#1F3A5F]'}`}>{s.c} · {s.n}</span>)}</div>} />
          <KV k="BM" v={o.bm} />
          <KV k="Site audit" v={o.auditBy === 'material_depot' ? <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">Material Depot ✓</span> : o.auditBy === 'customer' ? <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">Customer ✓</span> : <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">Not set</span>} />
        </Section>

        <Section title="Customer">
          <KV k="Name" v={
            <span className="flex flex-wrap items-center gap-1.5">
              {o.name}
              <button className="rounded-md border border-gray-200 px-2 py-0.5 text-[11px] font-semibold" onClick={() => setCustOpen((v) => !v)}>
                {custOpen ? 'Cancel' : 'Fix details'}
              </button>
            </span>
          } />
          <KV k="Phone" v={o.phone} />
          <KV k="Address" v={<MapLink addr={o.addr} />} />
          {custOpen ? (
            <div className="mt-2 flex flex-col gap-1.5">
              <Note tone="blue">Correct any field the OMS auto-fetch got wrong (e.g. name coming through as &quot;client&quot;) — this is logged to the activity timeline.</Note>
              <input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Customer name" className="w-full rounded-md border border-gray-200 px-2 py-2 text-[13px]" />
              <input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="Phone" className="w-full rounded-md border border-gray-200 px-2 py-2 text-[13px]" />
              <textarea value={custAddr} onChange={(e) => setCustAddr(e.target.value)} placeholder="Address" className="w-full rounded-md border border-gray-200 px-2 py-2 text-[13px] resize-y" />
              <button onClick={saveCustomer} className="self-start rounded-md bg-[#1F3A5F] px-3 py-1.5 text-[12px] font-semibold text-white">Save</button>
            </div>
          ) : null}
        </Section>

        {o.service && o.status !== 'deliv_ontime' && isSplit(o) ? (
          <Section title="Service details" subtitle="— split per SKU">
            <Note tone="amber">This order&apos;s SKUs are split across separate sub-jobs, so the flat SKU editor can&apos;t map back onto them. Edit each sub-job&apos;s SKUs below, or merge a split-off sub-job back first.</Note>
          </Section>
        ) : null}

        {o.service && o.status !== 'deliv_ontime' && !isSplit(o) ? (
          <Section title="Service details" subtitle="— edit if needed">
            <Note tone="blue">Update SKU codes, product names and area (sq.ft). Changes also update the installer&apos;s job items.</Note>
            <SkuGroup grp="flooring" label="Wooden Flooring" draft={draft} grpOn={grpOn} toggleGrp={toggleGrp} updateDraftField={updateDraftField} delDraftRow={delDraftRow} addDraftRow={addDraftRow} />
            <SkuGroup grp="wallpaper" label="Wallpaper" draft={draft} grpOn={grpOn} toggleGrp={toggleGrp} updateDraftField={updateDraftField} delDraftRow={delDraftRow} addDraftRow={addDraftRow} />
            <SkuGroup grp="wallpanel" label="Wall Panels" draft={draft} grpOn={grpOn} toggleGrp={toggleGrp} updateDraftField={updateDraftField} delDraftRow={delDraftRow} addDraftRow={addDraftRow} />
            <button className="bg-[#1F3A5F] text-white px-3 py-1.5 rounded-md text-xs font-semibold mt-2" onClick={saveService}>Save changes</button>
          </Section>
        ) : null}

        <Section title="Site audit type">
          <Note tone="blue">Who completed the site audit? This controls what the installer sees on their app.</Note>
          <div className="flex gap-2 flex-wrap mt-2">
            <button className={`px-3 py-1.5 rounded-md text-[13px] font-semibold ${o.auditBy === 'material_depot' ? 'bg-[#1F3A5F] text-white' : 'bg-white border border-gray-200 text-gray-700'}`} onClick={() => setAuditBy('material_depot')}>Material Depot audit</button>
            <button className={`px-3 py-1.5 rounded-md text-[13px] font-semibold ${o.auditBy === 'customer' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-700'}`} onClick={() => setAuditBy('customer')}>Customer self-audit</button>
          </div>
        </Section>

        <Section title="Delivery — confirm with Operations first">
          <KV k="Scheduled delivery" v={`${fmtDate(o.deliveryDate)} (${dleft <= 0 ? 'today/past' : 'in ' + dleft + 'd'})`} />
          <KV k="Type" v={o.customWp ? 'Custom wallpaper — call 3 days prior' : 'Standard — call 1 day prior'} />
          {['pending', 'call_na'].includes(o.status) ? (
            <>
              {o.status === 'call_na' ? <Note tone="red">Previous call was not answered — please retry before confirming delivery status.</Note> : null}
              <Note tone={opsCallDue(o) ? 'amber' : 'blue'}>{opsCallDue(o) ? 'Call Operations now to confirm delivery.' : 'Operations call not yet due. You can still record an outcome.'}</Note>
              <FieldDate label="If delayed — new delivery date from Operations" value={newDeliv} min={dstr(today)} onChange={setNewDeliv} />
            </>
          ) : o.status === 'deliv_delayed' ? (
            <>
              <Note tone="red">Delivery delayed — BM asked to inform client. If delayed further, update the date below and click &quot;Further delayed&quot;.</Note>
              <FieldDate label="New delivery date from Operations" value={newDeliv} min={dstr(today)} onChange={setNewDeliv} />
            </>
          ) : <Note tone="green">Delivery confirmed on time.</Note>}
        </Section>

        <Section title="Set status" subtitle="— manual override">
          <Note tone="blue">Installer steps (On the way / At site / Completed) update automatically per sub-job. You can also set any status manually here.</Note>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {Object.keys(STATUS).map((k) => (
              <button key={k} className={`px-2.5 py-1.5 rounded-md text-[12px] font-semibold border ${o.status === k ? 'bg-[#1F3A5F] text-white border-[#1F3A5F]' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400'}`} onClick={() => setStatus(k)}>
                {STATUS[k].l}
                {AUTO_STATUSES.includes(k) ? <span className="ml-1 text-[9px] font-extrabold bg-blue-100 text-blue-700 rounded px-1 py-0.5">AUTO</span> : null}
              </button>
            ))}
          </div>
        </Section>

        {o.status === 'deliv_ontime' ? (
          <Section title="Service creation">
            <Note tone="green">Delivery confirmed on time — you can now create the service. Customer, phone, address and BM are auto-filled. Add the SKU code, product name, and area (sq.ft) for each SKU.</Note>
            <ReadonlyField label="Customer name" value={o.name} />
            <ReadonlyField label="Phone" value={o.phone} />
            <ReadonlyField label="Address" value={o.addr} />
            <ReadonlyField label="BM" value={o.bm} />
            <SkuGroup grp="flooring" label="Wooden Flooring" draft={draft} grpOn={grpOn} toggleGrp={toggleGrp} updateDraftField={updateDraftField} delDraftRow={delDraftRow} addDraftRow={addDraftRow} />
            <SkuGroup grp="wallpaper" label="Wallpaper" draft={draft} grpOn={grpOn} toggleGrp={toggleGrp} updateDraftField={updateDraftField} delDraftRow={delDraftRow} addDraftRow={addDraftRow} />
            <SkuGroup grp="wallpanel" label="Wall Panels" draft={draft} grpOn={grpOn} toggleGrp={toggleGrp} updateDraftField={updateDraftField} delDraftRow={delDraftRow} addDraftRow={addDraftRow} />
          </Section>
        ) : null}

        {o.service || o.status === 'call_na' ? (() => {
          const fu = (o.service && o.service.follow_up_date) || '';
          const fuOver = !!fu && fu < dstr(today), fuToday = fu === dstr(today);
          return (
            <Section title="Follow-up date" subtitle="— optional">
              <Note tone="blue">Can&apos;t schedule yet? Set a follow-up date to remind yourself to come back and assign a slot when the client is ready.</Note>
              {fu ? (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 mt-2.5">
                  <div className="text-[12px] font-bold text-gray-700">📅 {fuToday ? 'Follow-up is today — schedule now!' : fuOver ? 'Follow-up overdue' : 'Follow-up reminder set'}</div>
                  <div className="text-[13.5px] font-bold text-gray-900">{fmtDate(fu)}</div>
                </div>
              ) : null}
              <div className="flex gap-2 mt-2 items-center flex-wrap">
                <input type="date" value={fuDate} min={dstr(today)} onChange={(e) => setFuDate(e.target.value)} className="px-2.5 py-2 border border-gray-200 rounded-md text-[13.5px] flex-1 min-w-[160px]" />
                <button className="bg-amber-600 text-white px-3 py-1.5 rounded-md text-xs font-semibold" onClick={setFollowUp}>{fu ? 'Update' : 'Set follow-up'}</button>
                {fu ? <button className="bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-md text-xs font-semibold" onClick={clearFollowUp}>Clear</button> : null}
              </div>
            </Section>
          );
        })() : null}

        {o.subjobs ? (
          <Section title="Installation sub-jobs">
            <Note tone="blue">Flooring, wallpaper and wall panels are scheduled &amp; tracked separately. Each can have multiple installers. Order completes only when all sub-jobs are done.</Note>
            {o.subjobs.map((sj) => {
              const rolls = totalRolls(sj), slotsN = slotsForWp(rolls);
              const totalSqft = (sj.items || []).reduce((s, it) => s + (parseFloat(it.sqft as any) || 0), 0);
              const skText = sj.items.map((it) => it.sku + (it.name ? ' · ' + it.name : '') + (it.sqft ? ' · ' + it.sqft + ' sq.ft' : '')).join(', ');
              return (
                <div className="rounded-lg border border-gray-200 p-3.5 mb-3" key={sj.id}>
                  <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${sjTypeClass(sj.type)}`}>{sjShortLabel(o, sj) === typeTag(sj.type) ? typeLabel(sj.type).toUpperCase() : sjShortLabel(o, sj).toUpperCase()}</span>
                    <span className="text-[12.5px] text-gray-600">{skText}</span>
                    <span className="ml-auto"><Chip st={subjobDisplayStatus(sj)} /></span>
                  </div>

                  <SubjobCrewProgress sj={sj} />
                  {sj.type === 'wallpaper'
                    ? <div className="flex items-center justify-between rounded-md bg-purple-50 px-3 py-2 mb-2.5 text-[12.5px] text-purple-800"><span>{totalSqft ? totalSqft + ' sq.ft → ' : ''}{rolls} roll{rolls === 1 ? '' : 's'} → <strong>{slotsN} slot{slotsN > 1 ? 's' : ''} · {slotsN * 3} hours</strong></span><span className="text-lg">🕐</span></div>
                    : <div className="text-[12px] text-green-700 mb-2.5">{typeLabel(sj.type)} — 1 full day per installer visit</div>}
                  <SjDeliveryRow order={o} subjob={sj} onSave={saveSjDelivery} />
                  {sj.status === 'completed' || (sj.status === 'partial' && sj.jobcard && (sj.jobcard.rooms || []).length)
                    ? <DownloadJobCardBtn order={o} sjId={sj.id} installers={installers} toast={toast} partial={sj.status === 'partial'} />
                    : null}
                  <AssignSection order={o} allOrders={allOrders} subjob={sj} installers={installers} shadowerPool={shadowerPool} city={city} slotsFl={slotsFl} slotsWp={slotsWp} attribution={attribution} installersErr={installersErr} onRetryInstallers={onRetryInstallers} reload={reload} toast={toast} onOpenOrder={onOpenOrder} />
                  <div className="flex flex-wrap gap-2 mt-2">
                    {!['completed', 'partial'].includes(sj.status) && (sj.items || []).length > 1 ? (
                      <button className="bg-white border border-gray-200 text-gray-700 px-2.5 py-1.5 rounded-md text-[12px] font-semibold" onClick={() => setSplitSjId(sj.id)}>✂ Split into separate visits…</button>
                    ) : null}
                    {/_\d+$/.test(sj.id) && (!sj.assignments || !sj.assignments.length) && !sj.jobcard ? (
                      <button className="bg-white border border-gray-200 text-gray-700 px-2.5 py-1.5 rounded-md text-[12px] font-semibold" onClick={() => doMerge(sj.id)}>↩ Merge back into {typeLabel(sj.type)}</button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </Section>
        ) : null}

        {o.service && o.service.rectification_raised ? (
          <Note tone="amber">↩ Rectification raised — new order <b>{o.service.rectification_pi || ''}</b> ({o.service.rectification_type === 'audit' ? 'Re-audit' : 'Re-installation'}). See the Rectifications tab.</Note>
        ) : null}

        <Section title="Activity">
          <div className="border-l-2 border-gray-200 ml-1.5 pl-4 flex flex-col gap-3">
            {o.log.slice().reverse().map((l, i) => (
              <div key={i} className="relative">
                <div className={`absolute -left-[21px] top-1 w-2 h-2 rounded-full ${l.by === 'auto' ? 'bg-blue-600' : l.by === 'manual' ? 'bg-amber-500' : 'bg-blue-400'}`} />
                <div className="text-[13px] font-bold text-gray-900">{l.who ? <span className="text-[#1F3A5F] font-extrabold">{l.who}</span> : null}{l.who ? ' · ' : ''}{l.t}</div>
                <div className="text-[11.5px] text-gray-400">{fmtLogLocal(l.d)}{l.by === 'auto' ? ' · installer' : l.by === 'manual' ? ' · SM' : ''}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>
      <div className="px-5 py-3.5 border-t border-gray-200 flex gap-2 flex-wrap bg-white">
        <button className="bg-white text-red-600 border border-red-200 px-3.5 py-2 rounded-md text-[13px] font-semibold" onClick={delOrder}>🗑 Delete</button>
        {o.status === 'pending' ? (
          <>
            <button className="bg-white text-red-600 border border-red-200 px-3.5 py-2 rounded-md text-[13px] font-semibold" onClick={markDelayed}>Delivery delayed</button>
            <button className="bg-green-600 text-white px-3.5 py-2 rounded-md text-[13px] font-semibold" onClick={markOnTime}>Delivery on time</button>
          </>
        ) : o.status === 'deliv_delayed' ? (
          <>
            <button className="bg-white border border-gray-200 text-gray-700 px-3.5 py-2 rounded-md text-[13px] font-semibold" onClick={onClose}>Close</button>
            <button className="bg-white text-red-600 border border-red-200 px-3.5 py-2 rounded-md text-[13px] font-semibold" onClick={markDelayed}>Further delayed</button>
            <button className="bg-green-600 text-white px-3.5 py-2 rounded-md text-[13px] font-semibold" onClick={markOnTime}>Now on time</button>
          </>
        ) : o.status === 'deliv_ontime' ? (
          <>
            <button className="bg-white border border-gray-200 text-gray-700 px-3.5 py-2 rounded-md text-[13px] font-semibold" onClick={onClose}>Close</button>
            <button className="bg-[#1F3A5F] text-white px-3.5 py-2 rounded-md text-[13px] font-semibold" onClick={createService}>Create service</button>
          </>
        ) : o.status === 'created' ? (
          <>
            <button className="bg-white border border-gray-200 text-gray-700 px-3.5 py-2 rounded-md text-[13px] font-semibold" onClick={onClose}>Close</button>
            <button className="bg-[#1F3A5F] text-white px-3.5 py-2 rounded-md text-[13px] font-semibold opacity-50 cursor-not-allowed" disabled>Schedule from sub-jobs above</button>
          </>
        ) : o.status === 'completed' ? (
          <>
            <button className="bg-white border border-gray-200 text-gray-700 px-3.5 py-2 rounded-md text-[13px] font-semibold" onClick={onClose}>Close</button>
            {o.service && o.service.rectification_raised
              ? <span className="flex-1 text-center bg-amber-100 text-amber-700 px-3.5 py-2 rounded-md text-[13px] font-semibold">↩ Rectified</span>
              : <button className="bg-amber-600 text-white px-3.5 py-2 rounded-md text-[13px] font-semibold" onClick={() => onOpenRect(o)}>↩ Raise Rectification</button>}
          </>
        ) : (
          <button className="bg-white border border-gray-200 text-gray-700 px-3.5 py-2 rounded-md text-[13px] font-semibold" onClick={onClose}>Close</button>
        )}
      </div>

      {splitSjId ? (
        <SplitPicker
          subjob={(o.subjobs || []).find((s) => s.id === splitSjId)!}
          onCancel={() => setSplitSjId(null)}
          onSplit={(skus) => { const id = splitSjId; setSplitSjId(null); doSplit(id, skus); }}
          toast={toast}
        />
      ) : null}
    </>
  );
}
