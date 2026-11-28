#!/usr/bin/env node
// node scripts/outreach-merge-duplicate.mjs --backend <url> --secret <x-sync-key> --keep <OR-id> --drop <OR-id> --by <name> [--skip-meetings 2026-10-27,…] [--backup <file>] [--apply]
import { writeFileSync } from 'node:fs';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const backend = (arg('backend') || '').replace(/\/+$/, '');
const secret = arg('secret');
const keepId = arg('keep');
const dropId = arg('drop');
const by = arg('by');
const skip = (arg('skip-meetings') || '').split(',').filter(Boolean);
const backup = arg('backup');
const apply = process.argv.includes('--apply');
if (!backend || !secret || !keepId || !dropId || !by) {
  console.error('Needs --backend, --secret, --keep, --drop and --by');
  process.exit(1);
}

async function b2b(path, init) {
  const res = await fetch(`${backend}/b2b${path}`, { ...init, headers: { 'x-sync-key': secret, 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`${path} answered ${res.status}: ${await res.text()}`);
  return res.json();
}

const noteMs = (ts) => {
  const m = String(ts).match(/^(\d+)\/(\d+)\/(\d{4}),\s*(\d+):(\d+):(\d+)\s*(am|pm)/i);
  if (!m) return 0;
  const h = (+m[4] % 12) + (/pm/i.test(m[7]) ? 12 : 0);
  return Date.UTC(+m[3], +m[2] - 1, +m[1], h, +m[5], +m[6]);
};
const lastFollowUpSet = (j) => (j || []).filter((e) => e.kind === 'follow-up-set').map((e) => e.at).sort().pop() || '';
const day = (iso) => String(iso || '').slice(0, 10);

const rows = (await b2b('/rows')).filter((r) => r.pipeline === 'outbound');
const keep = rows.find((r) => r.id === keepId);
const drop = rows.find((r) => r.id === dropId);
if (!keep || !drop) throw new Error(`Not found: ${!keep ? keepId : ''} ${!drop ? dropId : ''}`.trim());
if (backup) writeFileSync(backup, JSON.stringify([keep, drop], null, 1));
const k = keep.meta_data;
const d = drop.meta_data;

const skipped = (d.meetings || []).filter((m) => skip.includes(m.date));
const meetings = [...(d.meetings || []).filter((m) => !skip.includes(m.date)), ...(k.meetings || [])]
  .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a.n - b.n)
  .map((m, i) => ({ ...m, n: i + 1 }));

const contacts = [...(k.contacts || [])];
const known = new Set([k.phone, k.alt_phone, ...contacts.map((c) => c.phone)].filter(Boolean));
const added = [];
for (const c of [{ name: d.contact_person, role: d.designation, phone: d.phone }, { name: d.alt_name, role: d.alt_role, phone: d.alt_phone }, ...(d.contacts || [])]) {
  if (c.phone && !known.has(c.phone)) { contacts.push(c); added.push(c.name); known.add(c.phone); }
}

const at = new Date().toISOString();
const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
const label = `created ${day(drop.created_at)}${drop.owner ? `, BM ${drop.owner}` : ''}`;
const extras = [
  `${(d.meetings || []).length - skipped.length} meeting(s)`, `${(d.notes || []).length} note(s)`,
  ...(added.length ? [`contact ${added.join(', ')}`] : []), ...(!k.email && d.email ? ['email'] : []),
];
const skipText = skipped.map((m) => ` Its meeting on ${m.date} repeats one already logged here, so it is kept as this note, not as a second meeting: "${String(m.notes || '').trim()}"`).join('');
const notes = [...(d.notes || []), ...(k.notes || [])].sort((a, b) => noteMs(a.ts) - noteMs(b.ts))
  .concat({ ts, author: by, text: `Merged the duplicate Outreach lead for this client (${label}) into this one: ${extras.join(', ')}.${skipText}` });
const journey = [...(d.journey || []), ...(k.journey || [])].sort((a, b) => String(a.at).localeCompare(String(b.at)))
  .concat({ at, by, kind: 'note-added', text: `Merged the duplicate lead (${label}) into this one` });
const followFromDrop = lastFollowUpSet(d.journey) > lastFollowUpSet(k.journey) && d.follow_up_date;
const merged = {
  ...keep,
  meta_data: {
    ...k, email: k.email || d.email, contacts, meetings, notes, journey,
    ...(followFromDrop ? { follow_up_date: d.follow_up_date, follow_up_time: d.follow_up_time ?? null } : {}),
  },
};

const differ = ['company_type', 'team_size', 'segment', 'lead_type', 'office_address', 'gst_number', 'requirement']
  .filter((f) => d[f] && d[f] !== k[f]).map((f) => `${f}: kept "${k[f] ?? ''}", dropped "${d[f]}"`);
console.log(`${k.company}: keep ${keep.id} [${keep.stage}, ${keep.owner}], delete ${drop.id} [${drop.stage}, ${drop.owner}]`);
console.log(`  meetings ${meetings.map((m) => `${m.n}:${m.date}`).join(' ')}${skipped.length ? ` | skipped ${skipped.map((m) => m.date).join(',')}` : ''}`);
console.log(`  notes ${notes.length} | contacts added ${added.join(', ') || 'none'} | follow-up ${merged.meta_data.follow_up_date || '-'} ${followFromDrop ? '(from the dropped lead)' : '(kept)'}`);
for (const line of differ) console.log(`  ${line}`);
if (!apply) { console.log('Dry run. Add --apply to write the merged row and delete the other.'); process.exit(0); }

await b2b('/rows/bulk', { method: 'POST', body: JSON.stringify({ rows: [merged] }) });
await b2b(`/rows/${encodeURIComponent(drop.id)}?pipeline=outbound`, { method: 'DELETE' });
console.log(`Wrote ${keep.id}, deleted ${drop.id}.`);
