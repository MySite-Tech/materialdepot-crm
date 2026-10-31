'use client';

import { Rep } from '../models/outreach/intake';
import type { B2BTeam } from '@/lib/b2b/team/types';
import { useEffect, useMemo, useRef, useState } from 'react';

export type AssignTarget = Rep | { among: Rep[] };

export type AssignTeams = Partial<Record<B2BTeam, { reps: Rep[]; rotation: Rep[] }>>;

const TEAM_LABELS: [B2BTeam, string][] = [['inbound', 'Inbound'], ['outreach', 'Outreach'], ['kam', 'KAM']];

export const isRoundRobin = (t: AssignTarget): t is { among: Rep[] } => 'among' in t;

const modeBtn = (on: boolean) => `px-2.5 py-1 text-[12px] font-semibold ${on ? 'bg-[#0F766E] text-white' : 'bg-white text-teal-900'}`;

function PeoplePicker({ reps, set, onChange }: { reps: Rep[]; set: Set<string>; onChange: (next: Set<string>) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: globalThis.MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const flip = (name: string) => {
    const n = new Set(set);
    if (n.has(name)) n.delete(name); else n.add(name);
    onChange(n);
  };
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="px-2 py-1 text-[12px] border border-teal-200 rounded-md bg-white text-teal-900">
        Between {set.size} of {reps.length} ▾
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-[240px] max-h-[280px] overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg p-2">
          <div className="flex gap-3 px-1 pb-1.5 mb-1 border-b border-gray-100 text-[11px] font-semibold text-[#0F766E]">
            <button type="button" onClick={() => onChange(new Set(reps.map((r) => r.name)))}>All</button>
            <button type="button" onClick={() => onChange(new Set())}>None</button>
          </div>
          {reps.map((r) => (
            <label key={r.phone || r.name} className="flex items-center gap-2 px-1 py-1 text-[12px] text-gray-700 cursor-pointer">
              <input type="checkbox" checked={set.has(r.name)} onChange={() => flip(r.name)} />
              {r.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function AssignBar({ count, noun, teams, busy, rule, total, onPickAll, onAssign, onClear }: {
  count: number;
  noun: string;
  teams: AssignTeams;
  busy: boolean;
  rule: string;
  total?: number;
  onPickAll?: () => void;
  onAssign: (to: AssignTarget, team: B2BTeam) => void;
  onClear: () => void;
}) {
  const [chosen, setChosen] = useState<B2BTeam | null>(null);
  const open = TEAM_LABELS.map(([k]) => k).filter((k) => !!teams[k]);
  const team = chosen && teams[chosen] ? chosen : open.length === 1 ? open[0] : null;
  const reps = useMemo(() => (team ? teams[team]?.reps ?? [] : []), [team, teams]);
  const rotation = useMemo(() => (team ? teams[team]?.rotation ?? [] : []), [team, teams]);
  const [mode, setMode] = useState<'person' | 'round-robin'>('person');
  const [person, setPerson] = useState('');
  const [edited, setEdited] = useState<Set<string> | null>(null);
  const rosterKey = reps.map((r) => r.name).join('|');
  useEffect(() => { setPerson(''); setEdited(null); }, [rosterKey]);
  const set = useMemo(() => edited ?? new Set(rotation.map((r) => r.name)), [edited, rotation]);
  if (!count) return null;
  const rep = reps.find((r) => r.name === person);
  const among = reps.filter((r) => set.has(r.name));
  const ready = !!team && (mode === 'person' ? !!rep : among.length > 0);
  const submit = () => {
    if (!team) return;
    if (mode === 'round-robin') onAssign({ among }, team);
    else if (rep) onAssign(rep, team);
  };
  return (
    <div className="flex items-center gap-2 flex-wrap px-4 py-2 bg-teal-50 border-b border-teal-100 text-[12px]">
      <span className="font-semibold text-teal-900">{count} {noun}{count === 1 ? '' : 's'} selected</span>
      {onPickAll && total != null && count < total && (
        <button onClick={onPickAll} className="text-[12px] font-semibold text-teal-800 hover:underline">Select all {total}</button>
      )}
      <div className="inline-flex rounded-md border border-teal-200 overflow-hidden" aria-label="Team">
        {TEAM_LABELS.map(([k, label]) => (
          <button key={k} type="button" disabled={!teams[k]} onClick={() => setChosen(k)}
            title={teams[k] ? undefined : `These ${noun}s cannot go to ${label} from here`}
            className={`${modeBtn(team === k)} disabled:text-gray-300 disabled:cursor-not-allowed`}>{label}</button>
        ))}
      </div>
      <div className="inline-flex rounded-md border border-teal-200 overflow-hidden">
        <button type="button" onClick={() => setMode('person')} className={modeBtn(mode === 'person')}>One person</button>
        <button type="button" onClick={() => setMode('round-robin')} className={modeBtn(mode === 'round-robin')}>Round robin</button>
      </div>
      {mode === 'person' ? (
        <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Assign to"
          className="px-2 py-1 text-[12px] border border-teal-200 rounded-md bg-white">
          <option value="">Pick a person</option>
          {reps.map((r) => <option key={r.phone || r.name} value={r.name}>{r.name}</option>)}
        </select>
      ) : (
        <PeoplePicker reps={reps} set={set} onChange={setEdited} />
      )}
      <button disabled={busy || !ready} onClick={submit}
        className="px-3 py-1 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-50">
        {busy ? 'Assigning…' : 'Assign'}
      </button>
      <button onClick={onClear} className="px-2 py-1 text-[12px] text-teal-800 hover:underline">Clear</button>
      {(mode === 'round-robin' || count > 1) && <span className="w-full text-[11px] text-teal-800/70">{rule}</span>}
    </div>
  );
}
