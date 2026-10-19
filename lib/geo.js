export const LIVE_MS = 30 * 1000;
export const UPDATING_MS = 2 * 60 * 1000;
export const HIDE_MS = 15 * 60 * 1000;

// Safari-safe parsing of Postgres timestamps (microsecond precision).
export function parseTs(s) {
  if (!s) return 0;
  return Date.parse(String(s).replace(/(\.\d{3})\d+/, '$1'));
}

export function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatDistance(m) {
  if (m == null) return '';
  if (m < 50) return '< 50 m';
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// 'live' | 'updating' | 'stale' | 'hidden' | 'off'
export function getStatus(member, nowMs) {
  if (!member.sharing || member.lat == null || member.lng == null || !member.location_updated_at) {
    return 'off';
  }
  const age = nowMs - parseTs(member.location_updated_at);
  if (age <= LIVE_MS) return 'live';
  if (age <= UPDATING_MS) return 'updating';
  if (age <= HIDE_MS) return 'stale';
  return 'hidden';
}

export const STATUS_META = {
  live: { label: 'Live', cls: 'text-emerald-400' },
  updating: { label: 'Updating', cls: 'text-amber-300' },
  stale: { label: 'Location stale', cls: 'text-rose-400' },
  hidden: { label: 'Offline', cls: 'text-slate-500' },
  off: { label: 'Not sharing', cls: 'text-slate-400' },
};
