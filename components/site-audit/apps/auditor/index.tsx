'use client';

import { Screen } from '../types/auditor';

import { loadJobs } from './data';
import { JobDetailView } from './screens/job-detail';
import { JobListView } from './screens/job-list';
import { ActingAs, Order } from '../types/auditor';
import { Spinner } from './ui';
import { dstr, serializeRoom, todayMidnight } from './utils';
import { JobCardWizard } from './screens/wizard';
import { useLocationTracking } from '@/components/site-audit/apps/field-app-shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export default function SiteAuditorApp({ actingAs }: { actingAs: ActingAs }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selDay, setSelDay] = useState<string>(() => dstr(todayMidnight()));
  const [screen, setScreen] = useState<Screen>({ name: 'list' });
  const [toast, setToast] = useState<string | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ordersRef = useRef<Order[]>([]);
  ordersRef.current = orders;
  const today = useMemo(() => todayMidnight(), []);
  const locationTracker = useLocationTracking(actingAs.email);

  const showToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const refreshJobs = useCallback(async () => {
    const next = await loadJobs(actingAs.email, ordersRef.current);
    ordersRef.current = next;
    setOrders(next);
  }, [actingAs.email]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await refreshJobs();
      if (alive) setLoading(false);
    })();
    locationTracker.start(null);
    const pollTimer = setInterval(() => {
      if (!document.hidden) refreshJobs();
    }, 30000);
    const onVis = () => {
      if (!document.hidden) refreshJobs();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVis);
      locationTracker.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actingAs.email]);

  const updateOrder = useCallback((pi: string, updater: Partial<Order> | ((o: Order) => Order)) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.pi !== pi) return o;
        return typeof updater === 'function' ? updater(o) : { ...o, ...updater };
      }),
    );
  }, []);

  const curOrder = screen.name !== 'list' ? orders.find((o) => o.pi === screen.pi) || null : null;

  return (
    <div className="mx-auto max-w-3xl px-3 py-4 sm:px-0">
      {screen.name === 'list' && (
        <>
          <div className="mb-4">
            <h1 className="text-xl font-bold text-gray-900">Site Auditor</h1>
          </div>
          {loading ? (
            <Spinner />
          ) : (
            <JobListView orders={orders} selDay={selDay} onSelectDay={setSelDay} today={today} onOpenJob={(pi) => setScreen({ name: 'detail', pi })} />
          )}
        </>
      )}

      {screen.name === 'detail' &&
        (curOrder ? (
          <JobDetailView
            order={curOrder}
            actingAs={actingAs}
            onBack={() => setScreen({ name: 'list' })}
            onOpenJobCard={() => setScreen({ name: 'jobcard', pi: curOrder.pi })}
            onUpdateOrder={(updater) => updateOrder(curOrder.pi, updater)}
            showToast={showToast}
            locationTracker={locationTracker}
            refreshJobs={refreshJobs}
          />
        ) : (
          <NotFoundScreen onBack={() => setScreen({ name: 'list' })} />
        ))}

      {screen.name === 'jobcard' &&
        (curOrder ? (
          <JobCardWizard
            key={curOrder.pi}
            order={curOrder}
            actingAs={actingAs}
            onBack={(draftRooms) => {
              updateOrder(curOrder.pi, (o) => ({ ...o, jobcard: { rooms: draftRooms.map(serializeRoom) } }));
              setScreen({ name: 'detail', pi: curOrder.pi });
            }}
            onCompleted={(updatedOrder) => updateOrder(curOrder.pi, () => updatedOrder)}
            onDone={async () => {
              setScreen({ name: 'list' });
              await refreshJobs();
            }}
            showToast={showToast}
            locationTracker={locationTracker}
          />
        ) : (
          <NotFoundScreen onBack={() => setScreen({ name: 'list' })} />
        ))}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[400] -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function NotFoundScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
      <div className="mb-3 text-2xl">🔍</div>
      <div className="mb-4 text-sm text-gray-500">This job could not be found — it may have been reassigned or removed.</div>
      <button
        type="button"
        onClick={onBack}
        className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
      >
        ← Back to jobs
      </button>
    </div>
  );
}
