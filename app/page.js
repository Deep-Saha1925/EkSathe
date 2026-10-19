import Link from 'next/link';
import { MapPin, Radio, ShieldCheck, Users } from 'lucide-react';
import SetupNotice from '@/components/SetupNotice';
import { isSupabaseConfigured } from '@/lib/supabase';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-between bg-[radial-gradient(ellipse_at_top,_rgba(249,115,22,0.25),_transparent_60%)] px-5 pb-8 pt-[calc(env(safe-area-inset-top)+2rem)]">
      <div>
        <div className="flex items-center gap-2 text-orange-400">
          <MapPin size={28} />
          <span className="text-lg font-bold tracking-wide">EkSathe</span>
        </div>

        <h1 className="mt-8 text-4xl font-extrabold leading-tight text-white">
          Ride Together.
          <br />
          <span className="bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">
            Never Lose Your Squad.
          </span>
        </h1>

        <p className="mt-4 text-slate-300">
          Everyone in your group appears as a colored dot on one shared live map, with their name and a line
          linking the whole squad. Perfect for pandal hopping across Kolkata on bikes.
        </p>

        <div className="mt-6 space-y-3">
          {!isSupabaseConfigured && <SetupNotice />}
          <Feature icon={<Radio size={18} />} text="Live GPS from every phone, updated in realtime" />
          <Feature icon={<Users size={18} />} text="Join with a 6-character code or an invite link. No sign-up." />
          <Feature
            icon={<ShieldCheck size={18} />}
            text="Location is shared only with your group, only after you tap Share, and never stored as history."
          />
        </div>
      </div>

      <div className="mt-10 space-y-3">
        <Link href="/create" className="btn-primary">
          Create Group
        </Link>
        <Link href="/join" className="btn-secondary">
          Join Group
        </Link>
        <p className="pt-2 text-center text-xs text-slate-500">
          Tip: keep the screen on and the browser open while riding. Phones may pause GPS when locked.
        </p>
      </div>
    </main>
  );
}

function Feature({ icon, text }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
      <span className="mt-0.5 text-orange-400">{icon}</span>
      <span>{text}</span>
    </div>
  );
}
