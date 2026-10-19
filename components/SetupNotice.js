import { AlertTriangle } from 'lucide-react';

export default function SetupNotice() {
  return (
    <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle size={18} /> Supabase isn&apos;t configured yet
      </div>
      <p className="mt-2 leading-relaxed">
        Copy <code className="rounded bg-black/30 px-1">.env.example</code> to{' '}
        <code className="rounded bg-black/30 px-1">.env.local</code>, fill in{' '}
        <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
        <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>, then restart{' '}
        <code className="rounded bg-black/30 px-1">npm run dev</code>. On Vercel, add both variables and redeploy.
      </p>
    </div>
  );
}
