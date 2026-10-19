'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { haversine } from '@/lib/geo';

const HEARTBEAT_MS = 15000; // re-send even when standing still so friends see "Live"
const MIN_INTERVAL_MS = 4000; // never send faster than this
const MIN_MOVE_M = 8; // ignore GPS jitter smaller than this

// state: idle | requesting | sharing | unavailable | denied | unsupported | error
export default function useLocationSharing({ onSend }) {
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [myPosition, setMyPosition] = useState(null);
  const [sendFailed, setSendFailed] = useState(false);

  const watchId = useRef(null);
  const timer = useRef(null);
  const active = useRef(false);
  const latest = useRef(null);
  const last = useRef({ at: 0, lat: null, lng: null });
  const onSendRef = useRef(onSend);

  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  const send = useCallback(async (p) => {
    if (!active.current) return;
    last.current = { at: Date.now(), lat: p.lat, lng: p.lng };
    try {
      await onSendRef.current(p);
      if (active.current) setSendFailed(false);
    } catch {
      if (active.current) setSendFailed(true);
    }
  }, []);

  const clear = useCallback(() => {
    active.current = false;
    if (watchId.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    latest.current = null;
  }, []);

  const stop = useCallback(() => {
    clear();
    setState('idle');
    setError('');
    setMyPosition(null);
    setSendFailed(false);
  }, [clear]);

  const start = useCallback(() => {
    if (active.current) return;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState('unsupported');
      return;
    }
    if (!window.isSecureContext) {
      setState('error');
      setError('GPS needs a secure (HTTPS) connection.');
      return;
    }

    active.current = true;
    last.current = { at: 0, lat: null, lng: null };
    setState('requesting');
    setError('');

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        latest.current = p;
        setMyPosition(p);
        setState('sharing');
        const l = last.current;
        const moved = l.lat == null ? Infinity : haversine(l, p);
        if (Date.now() - l.at >= MIN_INTERVAL_MS && moved >= MIN_MOVE_M) send(p);
      },
      (err) => {
        if (err.code === 1) {
          clear();
          setState('denied');
        } else {
          setState('unavailable');
          setError(err.message || 'Waiting for GPS signal…');
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );

    timer.current = setInterval(() => {
      const p = latest.current;
      if (p && Date.now() - last.current.at >= HEARTBEAT_MS - 500) send(p);
    }, 5000);
  }, [clear, send]);

  useEffect(() => clear, [clear]);

  const isActive = state === 'sharing' || state === 'unavailable' || state === 'requesting';

  return { state, error, myPosition, sendFailed, isActive, start, stop };
}
