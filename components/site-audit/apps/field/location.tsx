'use client';

import { LOCATION_INTERVAL_MIN_GAP_MS, LOCATION_PATCH_INTERVAL_MS, LOCATION_WATCH_MIN_GAP_MS } from '../../constants/field-app';
import { LocationTracker } from '../../types/field-app';
import { sbGet, sbPatch } from '@/components/site-audit/siteAuditShared';
import { useCallback, useEffect, useRef } from 'react';

export function useLocationTracking(email: string): LocationTracker {
  const watchIdRef = useRef<number | null>(null);
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentRef = useRef(0);
  const activePiRef = useRef<string | null>(null);
  const emailRef = useRef(email);
  emailRef.current = email;

  const patchMyLoc = useCallback(async (lat: number | null, lng: number | null, pi: string | null) => {
    try {
      const rows = await sbGet('profiles?email=eq.' + encodeURIComponent(emailRef.current) + '&select=id');
      const id = Array.isArray(rows) ? rows[0]?.id : undefined;
      if (!id) return;
      await sbPatch('profiles', id, {
        last_lat: lat,
        last_lng: lng,
        last_loc_at: lat != null ? new Date().toISOString() : null,
        last_order_pi: pi || null,
      });
    } catch {
      return;
    }
  }, []);

  const start = useCallback(
    (orderPi: string | null) => {
      activePiRef.current = orderPi || null;
      if (watchIdRef.current !== null) return;
      if (!navigator.geolocation) return;
      if (intervalIdRef.current !== null) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const now = Date.now();
          if (now - lastSentRef.current > LOCATION_WATCH_MIN_GAP_MS) {
            lastSentRef.current = now;
            patchMyLoc(pos.coords.latitude, pos.coords.longitude, activePiRef.current);
          }
        },
        () => {},
        { enableHighAccuracy: false, maximumAge: 60000, timeout: 15000 },
      );
      intervalIdRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const now = Date.now();
            if (now - lastSentRef.current > LOCATION_INTERVAL_MIN_GAP_MS) {
              lastSentRef.current = now;
              patchMyLoc(pos.coords.latitude, pos.coords.longitude, activePiRef.current);
            }
          },
          () => {},
          { timeout: 5000, maximumAge: 60000 },
        );
      }, LOCATION_PATCH_INTERVAL_MS);
    },
    [patchMyLoc],
  );

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalIdRef.current !== null) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
    patchMyLoc(null, null, null);
  }, [patchMyLoc]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (intervalIdRef.current !== null) clearInterval(intervalIdRef.current);
    };
  }, []);

  return { start, stop };
}
