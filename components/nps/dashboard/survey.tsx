'use client';

import { BUCKET_TEXT, Q3_OPTIONS } from '../constants/nps';
import { ResultPill } from './ui';
import { bucketOf, fmtDate, fmtPhone } from '../utils/nps';
import { NPSRow } from '@/lib/mockApi';
import { useState } from 'react';

export function SurveyModal({ row, onClose, onSubmit }: { row: NPSRow; onClose: () => void; onSubmit: (payload: { footfall_id: number; score: number | null; understood: boolean | null; better: string[]; remark: string }) => Promise<void> }) {
  const [score, setScore] = useState<number | null>(row.score);
  const [understood, setUnderstood] = useState<boolean | null>(row.understood);
  const [better, setBetter] = useState<string[]>(row.better ?? []);
  const [remark, setRemark] = useState(row.remark);
  const [saving, setSaving] = useState(false);

  const bucket = score == null ? null : bucketOf(score);
  const toggleBetter = (opt: string) =>
    setBetter(b => b.includes(opt) ? b.filter(x => x !== opt) : [...b, opt]);

  const save = async () => {
    if (score == null) return;
    setSaving(true);
    try {
      await onSubmit({ footfall_id: row.id, score, understood, better, remark });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col">

        <div className="flex items-start justify-between px-6 pt-5 pb-3 shrink-0">
          <div>
            <h2 className="text-[18px] font-bold text-gray-900">NPS Survey</h2>
            <p className="text-[13px] text-gray-400 mt-0.5">Collect feedback from the customer.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="overflow-y-auto flex-1">

        <div className="px-6 grid grid-cols-2 gap-y-3 gap-x-6 pb-5">
          {[['Name', row.name || '—'], ['Phone', fmtPhone(row.contact)], ['Store', row.store || '—'], ['BM', row.bm || '—'], ['Visit Date', fmtDate(row.visit_date)]].map(([k, v]) => (
            <div key={k}>
              <div className="text-[12px] text-gray-400">{k}</div>
              <div className="text-[14px] text-gray-900 font-medium mt-0.5">{v}</div>
            </div>
          ))}
        </div>

        <div className="px-6 pb-5 space-y-6">

          <div>
            <div className="text-[15px] font-bold text-gray-900">Q1. How likely are you to recommend Material Depot to a friend? <span className="text-red-500">*</span></div>
            <div className="text-[12px] text-gray-400 mt-0.5">0 = Not at all likely, 10 = Extremely likely</div>
            <div className="flex flex-wrap gap-2 mt-3">
              {Array.from({ length: 11 }, (_, i) => i).map(n => {
                const sel = score === n;
                return (
                  <button
                    key={n}
                    onClick={() => setScore(n)}
                    className={`w-12 h-11 rounded-lg text-[14px] font-semibold border cursor-pointer transition-colors ${sel ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            {bucket && <div className={`text-[13px] font-semibold mt-2 ${BUCKET_TEXT[bucket]}`}>{bucket} ({bucket === 'Promoter' ? '9–10' : bucket === 'Passive' ? '7–8' : '0–6'})</div>}
          </div>

          <div>
            <div className="text-[15px] font-bold text-gray-900">Q2. Did our team understand what you were looking for? <span className="text-red-500">*</span></div>
            <div className="flex gap-3 mt-3">
              <button
                onClick={() => { setUnderstood(true); setBetter([]); }}
                className={`px-7 py-2.5 rounded-lg text-[14px] font-semibold border cursor-pointer transition-colors ${understood === true ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}
              >Yes</button>
              <button
                onClick={() => setUnderstood(false)}
                className={`px-7 py-2.5 rounded-lg text-[14px] font-semibold border cursor-pointer transition-colors ${understood === false ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}
              >No</button>
            </div>
          </div>

          {understood === false && (
          <div>
            <div className="text-[15px] font-bold text-gray-900">Q3. What could we have done better? <span className="text-[13px] font-normal text-gray-400">(optional)</span></div>
            <div className="space-y-2 mt-3">
              {Q3_OPTIONS.map(opt => {
                const checked = better.includes(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => toggleBetter(opt)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left cursor-pointer transition-colors ${checked ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}>
                      {checked && <span className="text-white text-[10px] leading-none">✓</span>}
                    </span>
                    <span className="text-[14px] text-gray-800 font-medium">{opt}</span>
                  </button>
                );
              })}
            </div>
          </div>
          )}

          <div>
            <div className="text-[15px] font-bold text-gray-900">Q4. Any suggestions for us? <span className="text-[13px] font-normal text-gray-400">(optional)</span></div>
            <textarea
              value={remark}
              onChange={e => setRemark(e.target.value)}
              rows={3}
              className="w-full mt-3 border border-gray-200 rounded-lg px-3 py-2 text-[14px] text-gray-800 outline-none focus:border-gray-400 resize-none"
            />
          </div>
        </div>
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <div className="flex items-center gap-2 mr-auto">
            <ResultPill score={score} />
            {row.status === 'submitted' && <span className="text-[13px] text-gray-400">Submitted — you can correct it.</span>}
          </div>
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-[14px] font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 cursor-pointer">Cancel</button>
          <button
            onClick={save}
            disabled={score == null || saving}
            className="px-6 py-2 rounded-lg text-[14px] font-semibold text-white bg-gray-900 hover:bg-black cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >{saving ? 'Saving…' : 'Update'}</button>
        </div>
      </div>
    </div>
  );
}
