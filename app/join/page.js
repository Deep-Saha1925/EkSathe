'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import SetupNotice from '@/components/SetupNotice';
import { isSupabaseConfigured } from '@/lib/supabase';
import { joinGroup, normalizeCode, validateCode, validateName } from '@/lib/groups';

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState('');
  const [code, setCode] = useState(normalizeCode(params.get('code') || ''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('eksathe:name');
      if (saved) setName(saved);
    } catch {}
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const problem = validateName(name) || validateCode(code);
    if (problem) return setError(problem);
    setLoading(true);
    try {
      const g = await joinGroup(code, name);
      try {
        localStorage.setItem('eksathe:name', name.trim());
      } catch {}
      setSuccess(`Joined “${g.name}”! Opening the map…`);
      router.push(`/g/${g.code}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <h1 className="text-3xl font-extrabold text-white">Join a group</h1>
      <label className="block">
        <span className="mb-1 block text-sm text-slate-400">Your name</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          placeholder="e.g. Snaha"
          autoComplete="given-name"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm text-slate-400">Group code</span>
        <input
          className="input text-center text-2xl font-bold uppercase tracking-[0.3em]"
          value={code}
          onChange={(e) => setCode(normalizeCode(e.target.value))}
          maxLength={6}
          placeholder="ABC123"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      {error && <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
      {success && (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">
          <Check size={16} /> {success}
        </p>
      )}
      <button className="btn-primary" disabled={loading}>
        {loading ? <Loader2 className="animate-spin" size={20} /> : null}
        {loading ? 'Joining…' : 'Join Group'}
      </button>
    </form>
  );
}

export default function JoinPage() {
  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-8 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-400">
        <ArrowLeft size={16} /> Back
      </Link>
      {!isSupabaseConfigured ? (
        <div className="mt-6">
          <SetupNotice />
        </div>
      ) : (
        <Suspense fallback={<div className="mt-10 text-slate-400">Loading…</div>}>
          <JoinForm />
        </Suspense>
      )}
    </main>
  );
}
