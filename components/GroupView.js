'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  LocateFixed,
  LogOut,
  Maximize2,
  Radio,
  Users,
  WifiOff,
} from 'lucide-react';
import SetupNotice from '@/components/SetupNotice';
import MemberList from '@/components/MemberList';
import useLocationSharing from '@/hooks/useLocationSharing';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { ensureSession } from '@/lib/session';
import {
  fetchGroupByCode,
  fetchMembers,
  getServerOffset,
  leaveGroup,
  normalizeCode,
  pushLocation,
  stopSharing,
} from '@/lib/groups';
import { getStatus, haversine } from '@/lib/geo';
import { copyText, inviteLink } from '@/lib/share';

const GroupMap = dynamic(() => import('@/components/GroupMap'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-slate-950 text-slate-400">Loading map…</div>
  ),
});

const ACTIVE = ['live', 'updating'];

export default function GroupView({ code }) {
  const router = useRouter();
  const [phase, setPhase] = useState('loading'); // loading | setup | ready | error
  const [fatal, setFatal] = useState('');
  const [user, setUser] = useState(null);
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [realtimeOk, setRealtimeOk] = useState(false);
  const [online, setOnline] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());
  const [command, setCommand] = useState({ type: null, n: 0 });
  const [sheetOpen, setSheetOpen] = useState(true);
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [invite, setInvite] = useState('');
  const offsetRef = useRef(0);
  const toastTimer = useRef(null);

  const onSend = useCallback(
    async (p) => {
      await pushLocation(group.id, user.id, p);
    },
    [group, user]
  );
  const sharing = useLocationSharing({ onSend });

  const flash = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  }, []);

  // ---------- Initial load ----------
  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setPhase('setup');
      return;
    }
    setPhase('loading');
    try {
      if (!code || normalizeCode(code) !== code || code.length !== 6) {
        router.replace('/join');
        return;
      }
      const u = await ensureSession();
      const g = await fetchGroupByCode(code);
      if (!g) {
        router.replace(`/join?code=${code}`); // not a member (or group expired)
        return;
      }
      let [ms, off] = await Promise.all([fetchMembers(g.id), getServerOffset()]);
      offsetRef.current = off;
      const mine = ms.find((m) => m.user_id === u.id);
      if (mine?.sharing) {
        // Page was reloaded while sharing; GPS is off until the user taps Share again.
        await stopSharing(g.id, u.id).catch(() => {});
        ms = await fetchMembers(g.id);
      }
      setUser(u);
      setGroup(g);
      setMembers(ms);
      setInvite(inviteLink(g.code));
      setPhase('ready');
    } catch (e) {
      setFatal(e.message);
      setPhase('error');
    }
  }, [code, router]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- Realtime + polling fallback ----------
  const refetch = useCallback(async () => {
    if (!group) return;
    try {
      setMembers(await fetchMembers(group.id));
    } catch {
      /* keep last known data */
    }
  }, [group]);

  useEffect(() => {
    if (!group) return;
    const supabase = getSupabase();

    const upsert = (payload) => {
      const row = payload.new;
      if (!row?.id) return;
      setMembers((prev) => {
        const i = prev.findIndex((m) => m.id === row.id);
        if (i === -1) return [...prev, row];
        const copy = [...prev];
        copy[i] = row;
        return copy;
      });
    };

    const channel = supabase
      .channel(`group:${group.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_members', filter: `group_id=eq.${group.id}` },
        upsert
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'group_members', filter: `group_id=eq.${group.id}` },
        upsert
      )
      // DELETE events can't be filtered server-side; we only act on ids we already know.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_members' }, (payload) => {
        const id = payload.old?.id;
        if (id) setMembers((prev) => prev.filter((m) => m.id !== id));
      })
      .subscribe((status) => {
        const ok = status === 'SUBSCRIBED';
        setRealtimeOk(ok);
        if (ok) refetch();
      });

    const poll = setInterval(refetch, 20000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [group, refetch]);

  // ---------- Clock + connectivity ----------
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now() + offsetRef.current), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => {
      setOnline(true);
      refetch();
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [refetch]);

  // ---------- Derived data ----------
  const enriched = useMemo(() => {
    if (!user) return [];
    const list = members.map((m) => {
      const isMe = m.user_id === user.id;
      let { lat, lng, accuracy } = m;
      let status = getStatus(m, nowMs);
      if (isMe) {
        if (sharing.isActive && sharing.myPosition) {
          lat = sharing.myPosition.lat;
          lng = sharing.myPosition.lng;
          accuracy = sharing.myPosition.accuracy;
          status = sharing.sendFailed || sharing.state === 'unavailable' ? 'updating' : 'live';
        } else {
          status = 'off';
        }
      }
      return { ...m, isMe, lat, lng, accuracy, status };
    });
    const me = list.find((m) => m.isMe);
    const myPos = me && ACTIVE.includes(me.status) ? { lat: me.lat, lng: me.lng } : null;
    return list
      .map((m) => ({
        ...m,
        distance: myPos && !m.isMe && m.lat != null ? haversine(myPos, { lat: m.lat, lng: m.lng }) : null,
      }))
      .sort((a, b) => (a.isMe ? -1 : b.isMe ? 1 : a.display_name.localeCompare(b.display_name)));
  }, [members, user, nowMs, sharing.isActive, sharing.myPosition, sharing.sendFailed, sharing.state]);

  const mapMembers = useMemo(
    () =>
      enriched.filter(
        (m) => m.lat != null && m.lng != null && ['live', 'updating', 'stale'].includes(m.status)
      ),
    [enriched]
  );
  const activeCount = enriched.filter((m) => ACTIVE.includes(m.status)).length;
  const me = enriched.find((m) => m.isMe);

  // ---------- Actions ----------
  async function doCopy(kind, text) {
    const ok = await copyText(text);
    if (ok) {
      setCopied(kind);
      setTimeout(() => setCopied(''), 1800);
    } else {
      flash('Could not copy. Long-press to copy manually.');
    }
  }

  async function handleStop() {
    sharing.stop();
    try {
      await stopSharing(group.id, user.id);
      refetch();
    } catch {
      flash('Stopped locally. Could not reach the server.');
    }
  }

  async function handleLeave() {
    if (!window.confirm('Leave this group? You will stop sharing and be removed from the map.')) return;
    setBusy(true);
    sharing.stop();
    try {
      await leaveGroup(group.id, user.id);
    } catch {
      /* even if this fails, the stale entry disappears on its own */
    }
    router.push('/');
  }

  function centerOnMe() {
    if (me && ACTIVE.includes(me.status)) setCommand((c) => ({ type: 'me', n: c.n + 1 }));
    else flash('Start sharing your location first.');
  }

  function fitAll() {
    if (mapMembers.length === 0) return flash('No one is sharing a location yet.');
    setCommand((c) => ({ type: 'fit', n: c.n + 1 }));
  }

  // ---------- Render ----------
  if (phase === 'setup') {
    return (
      <main className="mx-auto max-w-md p-5">
        <SetupNotice />
      </main>
    );
  }
  if (phase === 'loading') {
    return (
      <main className="grid min-h-screen place-items-center text-slate-300">
        <div className="flex items-center gap-2">
          <Loader2 className="animate-spin" size={20} /> Loading your group…
        </div>
      </main>
    );
  }
  if (phase === 'error') {
    return (
      <main className="mx-auto max-w-md space-y-4 p-5 pt-16">
        <p className="rounded-2xl bg-rose-500/10 p-4 text-rose-200">{fatal}</p>
        <button className="btn-primary" onClick={load}>
          Try again
        </button>
        <Link href="/" className="btn-secondary">
          Home
        </Link>
      </main>
    );
  }

  const banner = !online
    ? "You're offline. Updates resume when you reconnect."
    : !realtimeOk
    ? 'Reconnecting to live updates…'
    : sharing.sendFailed
    ? "Couldn't send your location. Retrying…"
    : '';

  return (
    <div className="fixed inset-0 overflow-hidden bg-slate-950">
      <GroupMap members={mapMembers} command={command} />

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-[1000] p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 shadow-xl backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold text-white">{group.name}</div>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Users size={12} /> {activeCount} live · {enriched.length} in group
            </div>
          </div>
          <button
            onClick={() => doCopy('code', group.code)}
            className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 font-mono text-lg font-bold tracking-widest text-white active:scale-95"
            aria-label="Copy group code"
          >
            {group.code}
            {copied === 'code' ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
          </button>
        </div>
        {(banner || toast) && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-amber-500/90 px-3 py-2 text-sm font-medium text-slate-900">
            {banner && <WifiOff size={14} />} {toast || banner}
          </div>
        )}
      </div>

      {/* Bottom sheet */}
      <div className="absolute inset-x-0 bottom-0 z-[1000]">
        <div className="absolute bottom-full right-3 mb-3 flex flex-col gap-3">
          <button
            onClick={fitAll}
            className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-slate-900/95 text-white shadow-xl active:scale-95"
            aria-label="Fit all friends"
          >
            <Maximize2 size={24} />
          </button>
          <button
            onClick={centerOnMe}
            className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl active:scale-95"
            aria-label="Center on me"
          >
            <LocateFixed size={24} />
          </button>
        </div>

        <div className="rounded-t-3xl border-t border-white/10 bg-slate-900/95 pb-[env(safe-area-inset-bottom)] shadow-2xl backdrop-blur">
          <button
            onClick={() => setSheetOpen((v) => !v)}
            className="flex w-full flex-col items-center px-4 pb-2 pt-2"
            aria-label="Toggle member list"
          >
            <span className="h-1.5 w-10 rounded-full bg-white/20" />
            <span className="mt-2 flex w-full items-center justify-between text-sm font-semibold text-white">
              <span>Squad ({enriched.length})</span>
              <span className="flex items-center gap-2">
                <span
                  className={`flex items-center gap-1 text-xs ${sharing.isActive ? 'text-emerald-400' : 'text-slate-400'}`}
                >
                  <Radio size={12} /> {sharing.isActive ? 'Sharing' : 'Not sharing'}
                </span>
                {sheetOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
              </span>
            </span>
          </button>

          {sheetOpen && (
            <div className="max-h-[48vh] space-y-4 overflow-y-auto px-4 pb-5">
              {/* Sharing status / control */}
              {!sharing.isActive ? (
                <div className="rounded-2xl border border-orange-400/30 bg-orange-400/10 p-4">
                  <div className="font-semibold text-white">Share your live location</div>
                  <p className="mt-1 text-sm text-slate-300">
                    Your GPS position will be shared with everyone in <b>{group.name}</b>. Nothing is stored as
                    history, and you can stop anytime.
                  </p>
                  {sharing.state === 'denied' && (
                    <p className="mt-2 text-sm text-rose-300">
                      Location permission was denied. Allow it in your browser/site settings, then tap again.
                    </p>
                  )}
                  {sharing.state === 'unsupported' && (
                    <p className="mt-2 text-sm text-rose-300">This browser doesn&apos;t support GPS location.</p>
                  )}
                  {sharing.state === 'error' && <p className="mt-2 text-sm text-rose-300">{sharing.error}</p>}
                  <button className="btn-primary mt-3" onClick={sharing.start}>
                    <Radio size={20} /> Start sharing my location
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                  <div className="flex items-center gap-2 font-semibold text-emerald-300">
                    {sharing.state === 'sharing' ? (
                      <Radio size={18} />
                    ) : (
                      <Loader2 size={18} className="animate-spin" />
                    )}
                    {sharing.state === 'sharing'
                      ? `Sharing live with ${group.name}`
                      : sharing.state === 'requesting'
                      ? 'Waiting for GPS permission / first fix…'
                      : 'Waiting for GPS signal…'}
                  </div>
                  <p className="mt-1 text-xs text-slate-300">
                    Keep this page open and the screen on. Phones may pause GPS when locked or when the browser is
                    in the background.
                  </p>
                  <button className="btn-secondary mt-3" onClick={handleStop}>
                    Stop sharing
                  </button>
                </div>
              )}

              <MemberList members={enriched} />

              {/* Invite */}
              <div>
                <div className="mb-2 text-sm text-slate-400">Invite friends</div>
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950 p-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{invite}</span>
                  <button
                    onClick={() => doCopy('link', invite)}
                    className="rounded-xl bg-white/10 p-3 active:scale-95"
                    aria-label="Copy invite link"
                  >
                    {copied === 'link' ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                  </button>
                </div>
              </div>

              <button className="btn-secondary !text-rose-300" onClick={handleLeave} disabled={busy}>
                <LogOut size={20} /> Leave group
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
