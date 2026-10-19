# EkSathe

Real-time friends GPS tracking for group rides, built for Durga Puja pandal hopping in Kolkata. Next.js (App Router) + Supabase Realtime + Leaflet/OpenStreetMap.

## How guest security works
No accounts, but not "code only" either:
1. On first visit, the browser signs in to Supabase **anonymously**, which gives a real `auth.uid()` saved in localStorage.
2. Groups and memberships can only be created through the `create_group` / `join_group` database functions. The group code is the invite secret checked inside `join_group`.
3. Row Level Security lets a guest read only the groups and members of groups they belong to, and update/delete only their own row (and only the location columns).
4. Timestamps are written by the database, not the phone, so clients cannot fake freshness.
5. Only the publishable key is in the browser. Never use the secret/service_role key.

Limits: a leaked code lets anyone with it join (like any invite link). Groups auto-expire after 48 hours and are deleted when empty.

## 1. Supabase setup
1. https://supabase.com -> New project (Mumbai or Singapore are closest to Kolkata).
2. **Authentication -> Providers -> Anonymous Sign-Ins -> enable.** (Required.)
3. **SQL Editor -> New query -> paste `supabase/schema.sql` -> Run.**
4. **Project Settings -> API:** copy the Project URL and the publishable key (or legacy anon key).
5. Verify under Database -> Replication that `group_members` is in the `supabase_realtime` publication.

## 2. Local run
```bash
npm install
cp .env.example .env.local     # fill in the two values
npm run dev                    # http://localhost:3000
npm run build && npm start     # production check
```

## 3. Test with two sessions
Phones can't use GPS over plain `http://192.168.x.x`, since browsers require HTTPS. Fastest path: deploy to Vercel first (below) and test on real phones there.

Two browser sessions on one computer:
1. Window A: normal Chrome, `http://localhost:3000` -> Create Group -> Open Live Map.
2. Window B: **Incognito** (separate anonymous user) -> open the invite link -> Join.
3. In each window: DevTools -> More tools -> **Sensors** -> Location -> pick a city or enter custom lat/long, then tap **Start sharing my location** and allow.
4. Change the Sensors location in one window and watch its dot move in the other, with the dashed line following.

## 4. Deploy to Vercel
```bash
git add -A && git commit -m "EkSathe MVP"
git branch -M main
git remote add origin https://github.com/<you>/eksathe.git
git push -u origin main
```
1. https://vercel.com/new -> import the repo (Framework: Next.js, auto-detected).
2. Settings -> Environment Variables: add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Production, Preview, Development).
3. Deploy. Share `https://<project>.vercel.app/join?code=XXXXXX` or just the code.
4. After changing env vars you must **redeploy** (they are inlined at build time).

## Troubleshooting
- **"Anonymous sign-ins are disabled"**: enable them (Supabase step 2).
- **"Supabase isn't configured"**: missing/placeholder env vars; restart dev server or redeploy.
- **"function create_group ... not found"**: run the full SQL script again. If the schema cache is stale, run `notify pgrst, 'reload schema';`.
- **Dots don't move live**: confirm the realtime publication (step 5). The app also polls every 20 s as a fallback.
- **GPS prompt never appears / "denied"**: needs HTTPS (or localhost). On iOS: Settings -> Privacy -> Location Services -> Safari Websites. On Android Chrome: site settings -> Location.
- **Location stops when phone locks**: expected for web apps. Keep the screen on, e.g. a phone mount with screen-timeout disabled.
- **Blank map tiles**: check network; OSM tiles are for light use only, so switch to a paid tile provider for heavy traffic.
- **Build errors after install**: delete `node_modules` and `.next`, then `npm install && npm run build`.
