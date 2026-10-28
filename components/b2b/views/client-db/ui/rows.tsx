'use client';

import { ClientContact, ClientGst, isValidContactNumber, validateGst } from '../../../models/client';
import { inputCls } from '../../../constants/ui';

export function ContactRows({ contacts, onChange }: { contacts: ClientContact[]; onChange: (c: ClientContact[]) => void }) {
  const set = (i: number, patch: Partial<ClientContact>) =>
    onChange(contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const makePrimary = (i: number) =>
    onChange(contacts.map((c, j) => ({ ...c, primary: j === i })));

  return (
    <div className="flex flex-col gap-2">
      {contacts.map((c, i) => {
        const bad = String(c.number || '').trim() && !isValidContactNumber(c.number);
        return (
          <div key={i} className="grid grid-cols-12 gap-1.5 items-start">
            <input
              value={c.number}
              onChange={(e) => set(i, { number: e.target.value })}
              placeholder="10-digit number"
              className={`col-span-4 ${inputCls} ${bad ? 'border-red-300' : ''}`}
            />
            <input value={c.name || ''} onChange={(e) => set(i, { name: e.target.value })} placeholder="Name" className={`col-span-3 ${inputCls}`} />
            <input value={c.label || ''} onChange={(e) => set(i, { label: e.target.value })} placeholder="Label (Owner…)" className={`col-span-3 ${inputCls}`} />
            <button
              onClick={() => makePrimary(i)}
              title="Primary — the number orders are mainly placed on"
              className={`col-span-1 h-[30px] text-[10px] font-bold rounded-md border ${c.primary ? 'bg-[#0F766E] text-white border-[#0F766E]' : 'bg-white text-gray-400 border-gray-200'} cursor-pointer`}
            >
              1°
            </button>
            <button
              onClick={() => onChange(contacts.filter((_, j) => j !== i))}
              disabled={contacts.length === 1}
              className="col-span-1 h-[30px] text-[13px] text-gray-300 hover:text-red-500 disabled:opacity-30 cursor-pointer"
            >
              ×
            </button>
            {bad && <p className="col-span-12 text-[10px] text-red-600 -mt-1">Not a valid 10-digit Indian mobile number.</p>}
          </div>
        );
      })}
      <button
        onClick={() => onChange([...contacts, { number: '', primary: contacts.length === 0 }])}
        className="self-start text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer"
      >
        + Add contact number
      </button>
    </div>
  );
}

export function GstRows({ gsts, onChange }: { gsts: ClientGst[]; onChange: (g: ClientGst[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {gsts.map((g, i) => {
        const v = validateGst(g.number);
        return (
          <div key={i} className="flex flex-col gap-0.5">
            <div className="flex gap-1.5 items-start">
              <input
                value={g.number}
                onChange={(e) => onChange(gsts.map((x, j) => (j === i ? { ...x, number: e.target.value.toUpperCase() } : x)))}
                placeholder="15-character GSTIN"
                className={`${inputCls} font-mono ${!v.storable ? 'border-red-300' : v.check === 'bad-checksum' ? 'border-amber-300' : ''}`}
              />
              <button onClick={() => onChange(gsts.filter((_, j) => j !== i))} className="px-2 text-[13px] text-gray-300 hover:text-red-500 cursor-pointer">×</button>
            </div>
            {v.check === 'valid' && (
              <span className="text-[10px] text-[#0F766E]">
                Valid · {v.stateName} · PAN {v.pan}
                <span className="text-gray-400"> — registered company name needs a GST Validator, which this CRM does not have</span>
              </span>
            )}
            {v.check === 'bad-checksum' && <span className="text-[10px] text-amber-700">{v.message} Saved anyway.</span>}
            {!v.storable && v.check !== 'empty' && <span className="text-[10px] text-red-600">{v.message}</span>}
            {g.registeredName && <span className="text-[10px] text-gray-500">Registered as {g.registeredName}</span>}
          </div>
        );
      })}
      <button onClick={() => onChange([...gsts, { number: '' }])} className="self-start text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">
        + Add GST number
      </button>
    </div>
  );
}
