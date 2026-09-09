'use client';

import { Job } from '../types';
import { JobListScreen } from '../screens/job-list';
import { Dispatch, RefObject, SetStateAction } from 'react';

export function InstallerListHost({ SLOTS, dayStripRef, days, displayJobs, done, openDetail, overdue, selDay, setSelDay, todayStr, todo, unscheduled }: {
  SLOTS: Record<string, { label: string; start: number; }>;
  dayStripRef: RefObject<HTMLDivElement | null>;
  days: Date[];
  displayJobs: Job[];
  done: Job[];
  openDetail: (key: string) => void;
  overdue: Job[];
  selDay: string;
  setSelDay: Dispatch<SetStateAction<string>>;
  todayStr: string;
  todo: Job[];
  unscheduled: Job[];
}) {
  return (
    <JobListScreen
      days={days}
      selDay={selDay}
      todayStr={todayStr}
      onSelectDay={setSelDay}
      dayStripRef={dayStripRef}
      jobs={displayJobs}
      overdue={overdue}
      unscheduled={unscheduled}
      todo={todo}
      done={done}
      slots={SLOTS}
      onOpen={openDetail}
    />
  );
}
