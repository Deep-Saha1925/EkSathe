import { getSupabase } from '@/lib/supabase';
import { ensureSession } from '@/lib/session';
import { parseTs } from '@/lib/geo';

export function normalizeCode(value) {
  return (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function validateName(name) {
  const n = (name || '').trim();
  if (!n) return 'Please enter your name.';
  if (n.length > 24) return 'Name must be 24 characters or fewer.';
  return '';
}

export function validateCode(code) {
  if (!/^[A-Z0-9]{6}$/.test(code || '')) return 'Group code must be 6 letters/numbers.';
  return '';
}

function clean(error) {
  return new Error(error?.message || 'Something went wrong. Please try again.');
}

export async function createGroup(groupName, displayName) {
  await ensureSession();
  const { data, error } = await getSupabase().rpc('create_group', {
    p_group_name: (groupName || '').trim(),
    p_display_name: displayName.trim(),
  });
  if (error) throw clean(error);
  return data; // { id, code, name }
}

export async function joinGroup(code, displayName) {
  await ensureSession();
  const { data, error } = await getSupabase().rpc('join_group', {
    p_code: code,
    p_display_name: displayName.trim(),
  });
  if (error) throw clean(error);
  return data; // { id, code, name }
}

// Row Level Security only returns the group if the current guest is a member.
export async function fetchGroupByCode(code) {
  const { data, error } = await getSupabase()
    .from('groups')
    .select('id, code, name, expires_at')
    .eq('code', code)
    .maybeSingle();
  if (error) throw clean(error);
  return data;
}

export async function fetchMembers(groupId) {
  const { data, error } = await getSupabase()
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true });
  if (error) throw clean(error);
  return data || [];
}

export async function pushLocation(groupId, userId, pos) {
  const { error } = await getSupabase()
    .from('group_members')
    .update({
      lat: pos.lat,
      lng: pos.lng,
      accuracy: Math.round(pos.accuracy || 0),
      sharing: true,
    })
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw clean(error);
}

export async function stopSharing(groupId, userId) {
  const { error } = await getSupabase()
    .from('group_members')
    .update({ sharing: false, lat: null, lng: null, accuracy: null })
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw clean(error);
}

export async function leaveGroup(groupId, userId) {
  const { error } = await getSupabase()
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw clean(error);
}

// Difference (ms) between the server clock and this phone's clock.
export async function getServerOffset() {
  try {
    const t0 = Date.now();
    const { data, error } = await getSupabase().rpc('server_now');
    const t1 = Date.now();
    if (error || !data) return 0;
    return parseTs(data) - (t0 + t1) / 2;
  } catch {
    return 0;
  }
}
