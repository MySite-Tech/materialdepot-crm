'use client';

import { useMemo } from 'react';
import { CHECKLIST_SECTIONS } from '@/lib/store-checklist/constants';
import type { ChecklistValue } from '@/lib/store-checklist/types';
import { dayProgress, storeLabel } from '@/lib/store-checklist/utils';
import { useChecklistDay } from '../hooks/use-checklist-day';
import { markedByLine, Notice, ProgressBar, SavePill } from '../ui/bits';
import { SectionCard } from './section';

export function ChecklistMarker({ storeCode, date, readOnly, readOnlyReason, userName }: {
  storeCode: string | null;
  date: string;
  readOnly: boolean;
  readOnlyReason: string | null;
  userName: string;
}) {
  const { day, loading, loadError, saveState, pending, setValue, setComment, setMany, retry, reload, unsavedCount } =
    useChecklistDay(storeCode, date, userName);

  const merged = useMemo(() => ({ ...(day?.items ?? {}), ...pending }), [day, pending]);
  const progress = useMemo(() => dayProgress(merged), [merged]);
  const sectionProgress = useMemo(
    () => new Map(progress.sections.map((s) => [s.key, s])),
    [progress],
  );

  if (!storeCode) {
    return (
      <div className="p-6">
        <Notice tone="gray">Pick a store above to open its checklist for {date}.</Notice>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6 flex flex-col gap-3 items-start">
        <Notice tone="red">
          <strong>Could not open the {storeLabel(storeCode)} checklist for {date}.</strong>
          <br />
          {loadError}
          <br />
          Nothing marked now would be saved, so the checklist is not shown. Mark the sheet on paper and tell the tech team.
        </Notice>
        <button
          type="button"
          onClick={reload}
          className="px-3 py-1.5 rounded-md border border-gray-200 bg-white text-[12.5px] font-semibold text-gray-600 cursor-pointer hover:border-gray-300"
        >
          Try again
        </button>
      </div>
    );
  }

  if (loading && !day) {
    return <div className="p-6 text-[13px] text-gray-400">Loading {storeLabel(storeCode)}…</div>;
  }

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-3">
      <div className="bg-white border border-gray-200 rounded-lg px-3.5 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex flex-col">
          <span className="text-[13px] font-bold text-gray-800">{storeLabel(storeCode)}{' '}· {date}</span>
          <span className="text-[11.5px] text-gray-400">{markedByLine(day?.updatedBy ?? null, day?.updatedAt ?? null)}</span>
        </div>
        <ProgressBar progress={progress} />
        <div className="flex items-center gap-3 ml-auto">
          {progress.no > 0 && (
            <span className="text-[12px] font-semibold text-red-600">{progress.no}{' '}marked No</span>
          )}
          {!readOnly && <SavePill state={saveState} unsavedCount={unsavedCount} onRetry={retry} />}
        </div>
      </div>

      {readOnly && readOnlyReason && <Notice tone="gray">{readOnlyReason}</Notice>}

      {!readOnly && progress.noWithoutNote > 0 && (
        <Notice tone="amber">
          {progress.noWithoutNote} item{progress.noWithoutNote === 1 ? ' is' : 's are'}{' '}
          marked No with no note. Add what is wrong so the store manager can act on it — the mark is saved either way.
        </Notice>
      )}

      {CHECKLIST_SECTIONS.map((section) => {
        const sp = sectionProgress.get(section.key);
        if (!sp) return null;
        return (
          <SectionCard
            key={section.key}
            section={section}
            progress={sp}
            markOf={(id) => merged[id]}
            isUnsaved={(id) => id in pending}
            readOnly={readOnly}
            onValue={(id, v: ChecklistValue) => setValue(id, v)}
            onComment={setComment}
            onMarkRemainingYes={(ids) => setMany(ids, 'yes')}
          />
        );
      })}
    </div>
  );
}
