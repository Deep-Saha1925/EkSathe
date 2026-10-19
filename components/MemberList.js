import { STATUS_META, formatDistance } from '@/lib/geo';

export default function MemberList({ members }) {
  return (
    <ul className="space-y-2">
      {members.map((m) => {
        const meta = STATUS_META[m.status] || STATUS_META.off;
        return (
          <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-3">
            <span
              className="h-4 w-4 shrink-0 rounded-full border-2 border-white"
              style={{ background: m.color }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-white">
                {m.display_name}
                {m.isMe ? <span className="ml-1 text-xs font-normal text-slate-400">(You)</span> : null}
              </div>
              <div className={`text-xs ${meta.cls}`}>{meta.label}</div>
            </div>
            {!m.isMe && m.distance != null && (
              <div className="text-sm font-medium text-slate-300">{formatDistance(m.distance)}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
