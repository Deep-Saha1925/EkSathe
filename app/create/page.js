'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Copy, Loader2 } from 'lucide-react';
import SetupNotice from '@/components/SetupNotice';
import { isSupabaseConfigured } from '@/lib/supabase';
import { createGroup, validateName } from '@/lib/groups';
import { copyText, inviteLink } from '@/lib/share';

export default function CreatePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('eksathe:name');
      if (saved) setName(saved);
    } catch {}
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const problem = validateName(name);
    if (problem) return setError(problem);
    setLoading(true);
    try {
      const g = await createGroup(groupName, name);
      try {
        localStorage.setItem('eksathe:name', name.trim());
      } catch {}
      setCreated(g);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onCopy() {
    const ok = await copyText(inviteLink(created.code));
    setCopied(ok);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-8 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-400">
        <ArrowLeft size={16} /> Back
      </Link>

      {!isSupabaseConfigured ? (
        <div className="mt-6">
          <SetupNotice />
        </div>
      ) : created ? (
        <div className="mt-6 space-y-5">
          <div className="flex items-center gap-2 text-emerald-400">
            <Check size={20} /> <span className="font-semibold">Group created!</span>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900 p-5 text-center">
            <div className="text-sm text-slate-400">{created.name}</div>
            <div className="mt-2 text-5xl font-extrabold tracking-[0.3em] text-white">{created.code}</div>
            <div className="mt-1 text-xs text-slate-500">Group code</div>
          </div>
          <div>
            <div className="mb-2 text-sm text-slate-400">Invitation link</div>
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900 p-3">
              <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{inviteLink(created.code)}</span>
              <button onClick={onCopy} className="rounded-xl bg-white/10 p-3 active:scale-95" aria-label="Copy link">
                {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
              </button>
            </div>
          </div>
          <button className="btn-primary" onClick={() => router.push(`/g/${created.code}`)}>
            Open Live Map
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <h1 className="text-3xl font-extrabold text-white">Create a group</h1>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-400">Your name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder="e.g. Rahul"
              autoComplete="given-name"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-400">Group name (optional)</span>
            <input
              className="input"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={40}
              placeholder="e.g. North Kolkata Riders"
            />
          </label>
          {error && <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
          <button className="btn-primary" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={20} /> : null}
            {loading ? 'Creating…' : 'Create Group'}
          </button>
        </form>
      )}
    </main>
  );
}
