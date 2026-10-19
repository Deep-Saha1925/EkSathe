import { getSupabase } from '@/lib/supabase';

// Guest membership: every browser gets an anonymous Supabase user (persisted in localStorage).
// That user's uid is what database policies check. No email or password is needed.
export async function ensureSession() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured.');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) return session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    if (/anonymous/i.test(error.message)) {
      throw new Error(
        'Anonymous sign-ins are disabled. In Supabase: Authentication -> Providers -> enable "Anonymous Sign-Ins".'
      );
    }
    throw new Error(error.message);
  }
  return data.user;
}
