#!/usr/bin/env node
// node scripts/outreach-meeting-repair.mjs --backend <url> --secret <x-sync-key> [--out changed.json] [--apply]
import { writeFileSync } from 'node:fs';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const backend = (arg('backend') || '').replace(/\/+$/, '');
const secret = arg('secret');
const out = arg('out');
const apply = process.argv.includes('--apply');
if (!backend || !secret) {
  console.error('Needs --backend and --secret');
  process.exit(1);
}

async function b2b(path, init) {
  const res = await fetch(`${backend}/b2b${path}`, { ...init, headers: { 'x-sync-key': secret, 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`${path} answered ${res.status}: ${await res.text()}`);
  return res.json();
}

const istDay = (iso) => {
  const s = String(iso || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  return Number.isNaN(t) ? '' : new Date(t + 5.5 * 3_600_000).toISOString().slice(0, 10);
};

function firstBooked(journey, n) {
  const e = (journey || []).find((j) => j.kind === 'meeting-scheduled' && j.text.startsWith(`Meeting ${n} (`));
  return e ? (e.text.match(/\((\d{4}-\d{2}-\d{2})\)/) || [])[1] || '' : '';
}

function repair(row, now) {
  const md = row.meta_data || {};
  const meetings = (md.meetings || []).map((m) => ({ ...m }));
  const events = [];
  const say = (kind, text) => events.push({ at: now, by: 'CRM repair', kind, text });

  for (const m of meetings) {
    if (m.status !== 'Scheduled' || !m.checkIn) continue;
    const day = istDay(m.checkIn.at);
    if (day && m.date !== day) {
      say('meeting-scheduled', `Meeting ${m.n} re-dated to its check-in day ${day} (it had been moved to ${m.date})`);
      m.date = day;
    }
  }

  const open = row.stage !== 'Closed' && row.stage !== 'Lost';
  const last = Math.max(0, ...meetings.map((m) => m.n));
  for (const m of meetings) {
    if (m.status !== 'Postponed' || !m.date) continue;
    const postponedOn = istDay(m.updatedAt);
    if (!postponedOn || m.date <= postponedOn) continue;
    const booked = firstBooked(md.journey, m.n);
    const was = m.checkIn ? istDay(m.checkIn.at) : booked && booked <= postponedOn ? booked : postponedOn;
    const rebookFor = { date: m.date, time: m.time };
    m.date = was;
    if (open && m.n === last && !meetings.some((x) => x.status === 'Scheduled')) {
      meetings.push({
        n: last + 1, date: rebookFor.date, time: rebookFor.time, area: m.area, officeLocation: m.officeLocation,
        status: 'Scheduled', loggedBy: m.loggedBy, updatedAt: now,
      });
      say('meeting-scheduled', `Meeting ${last + 1} (${rebookFor.date}) scheduled — Meeting ${m.n} was postponed to that date, which only moved its date`);
    } else {
      say('meeting-postponed', `Meeting ${m.n} put back on ${was}, the day it was postponed from (it read ${rebookFor.date})`);
    }
  }

  if (!events.length) return null;
  return { ...row, meta_data: { ...md, meetings, journey: [...(md.journey || []), ...events] } };
}

const now = new Date().toISOString();
const rows = (await b2b('/rows')).filter((r) => r.pipeline === 'outbound');
const changed = rows.map((r) => repair(r, now)).filter(Boolean);
const added = changed.reduce((a, r) => a + r.meta_data.meetings.length, 0) - changed.reduce((a, r) => a + (rows.find((x) => x.id === r.id).meta_data.meetings || []).length, 0);
const byOwner = changed.reduce((a, r) => ({ ...a, [r.owner || '(none)']: (a[r.owner || '(none)'] || 0) + 1 }), {});
console.log(`${rows.length} outreach rows, ${changed.length} to repair, ${added} meetings rebooked`, byOwner);
if (out) writeFileSync(out, JSON.stringify(changed));
if (!apply) {
  console.log('Dry run. Re-run with --apply to write.');
  process.exit(0);
}
for (let i = 0; i < changed.length; i += 200) {
  await b2b('/rows/bulk', { method: 'POST', body: JSON.stringify({ rows: changed.slice(i, i + 200) }) });
}
console.log(`Wrote ${changed.length} rows.`);
