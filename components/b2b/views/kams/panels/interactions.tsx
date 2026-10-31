'use client';

import { ClientEntity, ClientInteraction, INTERACTION_SUMMARY, INTERACTION_TYPES, InteractionType, TEMPERATURE_BANDS, TEMPERATURE_MAX, clampTemperature, currentTemperature, temperatureColor } from '../../../models/client';
import { interactionGateErrors, interactionPrompts } from '../../../models/kam';
import { newB2BId } from '../../../models/ids';
import { Field } from '../ui';
import { btnGhost, btnPrimary, inputCls } from '../../../constants/ui';
import { CheckInLine } from '../../../ui/check-in-capture';
import { useState } from 'react';

export function InteractionModal({ client, loggedBy, today, open, initialType, onClose, onSave }: {
  client: ClientEntity;
  loggedBy: string;
  today: string;
  open: ClientInteraction | undefined;
  initialType: InteractionType;
  onClose: () => void;
  onSave: (i: ClientInteraction) => Promise<string | null>;
}) {
  const [type, setType] = useState<InteractionType>(initialType);
  const [picked, setDate] = useState(today);
  const completing = type === 'Meeting' ? open : undefined;
  const date = completing ? completing.date : picked;
  const [summary, setSummary] = useState('');
  const [temperature, setTemperature] = useState<string>('');
  const [upcomingProject, setUpcomingProject] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const draft = { type, date, nextFollowUpDate, summary, checkIn: completing?.checkIn, temperature: temperature === '' ? undefined : Number(temperature) };
  const errors = interactionGateErrors(draft, today);
  const prompts = interactionPrompts(draft);
  const previous = currentTemperature(client.interactions);

  const save = async () => {
    if (errors.length) return;
    setSaving(true);
    setError('');
    const err = await onSave({
      id: completing?.id || newB2BId('INT'),
      type,
      date,
      summary: summary.trim() || undefined,
      temperature: temperature === '' ? undefined : clampTemperature(temperature),
      upcomingProject: upcomingProject.trim() || undefined,
      nextFollowUpDate: nextFollowUpDate || undefined,
      loggedBy,
      checkIn: completing?.checkIn,
      createdAt: completing?.createdAt || new Date().toISOString(),
    });
    setSaving(false);
    if (err) setError(err); else onClose();
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[540px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">Log an interaction</h2>
            <p className="text-[11px] text-gray-400">{client.company} · KAM PRD §3.1</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Interaction type">
              <div className="flex rounded-md border border-gray-200 overflow-hidden">
                {INTERACTION_TYPES.map((t) => (
                  <button key={t} onClick={() => setType(t)}
                    className={`flex-1 px-2 py-1.5 text-[12px] font-semibold cursor-pointer ${type === t ? 'bg-[#1A1A1A] text-white' : 'bg-white text-gray-500'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Date">
              <input type="date" max={today} value={date} disabled={!!completing} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </Field>
          </div>

          {type === 'Meeting' && (completing?.checkIn
            ? <div className="rounded-md border border-teal-100 bg-teal-50/60 px-3 py-2"><CheckInLine c={completing.checkIn} /></div>
            : <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">No check-in for this firm. Close this, use <strong>Check in at a meeting</strong> when you arrive, then add the minutes here.</p>)}

          <Field label={INTERACTION_SUMMARY[type].label}>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className={inputCls + ' resize-none'}
              placeholder={INTERACTION_SUMMARY[type].placeholder} />
          </Field>

          <Field
            label="Account temperature"
            hint={`0 is very bad, ${TEMPERATURE_MAX} is very good.${previous ? ` Last reading ${previous.value}/10 on ${previous.at}.` : ' No reading on file yet.'}`}
          >
            <div className="flex items-center gap-2">
              <input
                type="range" min={0} max={TEMPERATURE_MAX} step={1}
                value={temperature === '' ? 5 : Number(temperature)}
                onChange={(e) => setTemperature(e.target.value)}
                className="flex-1 cursor-pointer"
              />
              <span className="w-9 text-center text-[13px] font-bold font-mono"
                style={{ color: temperature === '' ? '#9CA3AF' : temperatureColor(Number(temperature)) }}>
                {temperature === '' ? '—' : temperature}
              </span>
              {temperature !== '' && (
                <button onClick={() => setTemperature('')} className="text-[10px] font-semibold text-gray-400 hover:underline cursor-pointer">clear</button>
              )}
            </div>
            <div className="flex gap-1 mt-1">
              {TEMPERATURE_BANDS.map((b) => (
                <span key={b.key} className="text-[9px] font-semibold" style={{ color: b.color }}>{b.label}</span>
              ))}
            </div>
          </Field>

          <Field label="Upcoming project details" hint="§3.3 — anything the client has flagged as coming up. Leaving it blank keeps whatever is already on file.">
            <textarea value={upcomingProject} onChange={(e) => setUpcomingProject(e.target.value)} rows={2} className={inputCls + ' resize-none'} />
          </Field>

          <Field
            label={`Next follow-up date${type !== 'Meeting' ? ' *' : ''}`}
            hint={type !== 'Meeting'
              ? `Required on a logged ${type.toLowerCase()} — it is what fills Today’s Calls and the Follow-up Queue.`
              : 'Optional on a meeting.'}
          >
            <input type="date" min={date} value={nextFollowUpDate} onChange={(e) => setNextFollowUpDate(e.target.value)} className={inputCls} />
          </Field>

          {!!errors.length && (
            <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          {!errors.length && !!prompts.length && (
            <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5">
              {prompts.map((p, i) => <div key={i}>{p}</div>)}
            </div>
          )}
          {error && <p className="text-[12px] text-red-600">Could not save: {error}</p>}

          <p className="text-[10px] text-gray-400">
            There is no reminder service in this CRM. A follow-up date puts the client in Today&apos;s Calls or the
            Follow-up Queue — nothing is sent to anyone.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button onClick={save} disabled={saving || !!errors.length} className={btnPrimary}>{saving ? 'Saving…' : 'Log interaction'}</button>
        </div>
      </div>
    </div>
  );
}
