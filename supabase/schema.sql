-- =========================================================
-- EkSathe schema. Run once in the Supabase SQL Editor.
-- Prerequisite: Authentication -> Providers -> enable "Anonymous Sign-Ins".
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  name        text not null check (char_length(name) between 1 and 40),
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '48 hours'
);

create table if not exists public.group_members (
  id                   uuid primary key default gen_random_uuid(),
  group_id             uuid not null references public.groups(id) on delete cascade,
  user_id              uuid not null,
  display_name         text not null check (char_length(display_name) between 1 and 24),
  color                text not null,
  lat                  double precision check (lat between -90 and 90),
  lng                  double precision check (lng between -180 and 180),
  accuracy             double precision,
  sharing              boolean not null default false,
  location_updated_at  timestamptz,
  joined_at            timestamptz not null default now(),
  unique (group_id, user_id)
);

create index if not exists idx_members_group    on public.group_members (group_id);
create index if not exists idx_members_user     on public.group_members (user_id);
create index if not exists idx_members_updated  on public.group_members (location_updated_at);
create index if not exists idx_groups_expires   on public.groups (expires_at);

-- ---------- Helper: membership check (SECURITY DEFINER avoids RLS recursion) ----------
create or replace function public.is_group_member(p_group uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group and user_id = auth.uid()
  );
$$;

-- ---------- Row Level Security ----------
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;

drop policy if exists groups_select_member on public.groups;
create policy groups_select_member on public.groups
  for select to authenticated
  using (public.is_group_member(id) and expires_at > now());

drop policy if exists members_select_same_group on public.group_members;
create policy members_select_same_group on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists members_update_own on public.group_members;
create policy members_update_own on public.group_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists members_delete_own on public.group_members;
create policy members_delete_own on public.group_members
  for delete to authenticated
  using (user_id = auth.uid());

-- No INSERT policies: groups/members are created ONLY through the RPC functions below.

-- ---------- Table privileges (defense in depth) ----------
revoke all on public.groups        from anon, authenticated;
revoke all on public.group_members from anon, authenticated;
grant select on public.groups to authenticated;
grant select, delete on public.group_members to authenticated;
-- Members may change ONLY their location/sharing columns (not name, group, user_id, timestamps).
grant update (lat, lng, accuracy, sharing) on public.group_members to authenticated;

-- ---------- Trigger: server-side timestamps, clear location when not sharing ----------
create or replace function public.touch_location()
returns trigger
language plpgsql
as $$
begin
  if new.sharing and new.lat is not null and new.lng is not null then
    new.location_updated_at := now();
  else
    new.sharing := false;
    new.lat := null;
    new.lng := null;
    new.accuracy := null;
    new.location_updated_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_touch_location on public.group_members;
create trigger trg_touch_location
  before update on public.group_members
  for each row execute function public.touch_location();

-- ---------- Trigger: delete a group when its last member leaves ----------
create or replace function public.drop_empty_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  delete from public.groups g
  where g.id = old.group_id
    and not exists (select 1 from public.group_members m where m.group_id = g.id);
  return old;
end;
$$;

drop trigger if exists trg_drop_empty_group on public.group_members;
create trigger trg_drop_empty_group
  after delete on public.group_members
  for each row execute function public.drop_empty_group();

-- ---------- Cleanup (called opportunistically; no pg_cron needed) ----------
create or replace function public.cleanup_expired()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.groups where expires_at < now();
  update public.group_members
     set sharing = false
   where sharing and location_updated_at < now() - interval '1 hour';
$$;
revoke execute on function public.cleanup_expired() from public, anon, authenticated;

-- ---------- RPC: create_group ----------
create or replace function public.create_group(p_group_name text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_name     text := btrim(coalesce(p_display_name, ''));
  v_gname    text := btrim(coalesce(p_group_name, ''));
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_palette  constant text[] := array['#FF5C5C','#3B82F6','#22C55E','#F59E0B','#A855F7',
                                      '#EC4899','#14B8A6','#F97316','#84CC16','#06B6D4'];
  v_code     text;
  v_id       uuid;
  i          int;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 24 then
    raise exception 'Name must be 1-24 characters';
  end if;
  if v_gname = '' then v_gname := left(v_name, 20) || '''s Squad'; end if;
  v_gname := left(v_gname, 40);

  perform public.cleanup_expired();

  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    begin
      insert into public.groups (code, name, created_by)
      values (v_code, v_gname, v_uid)
      returning id into v_id;
      exit;
    exception when unique_violation then
      null; -- collision, try another code
    end;
  end loop;

  insert into public.group_members (group_id, user_id, display_name, color)
  values (v_id, v_uid, v_name, v_palette[1]);

  return jsonb_build_object('id', v_id, 'code', v_code, 'name', v_gname);
end;
$$;

-- ---------- RPC: join_group ----------
create or replace function public.join_group(p_code text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_code    text := upper(btrim(coalesce(p_code, '')));
  v_name    text := btrim(coalesce(p_display_name, ''));
  v_palette constant text[] := array['#FF5C5C','#3B82F6','#22C55E','#F59E0B','#A855F7',
                                     '#EC4899','#14B8A6','#F97316','#84CC16','#06B6D4'];
  v_group   public.groups%rowtype;
  v_count   int;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if v_code !~ '^[A-Z0-9]{6}$' then raise exception 'That group code looks invalid'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 24 then
    raise exception 'Name must be 1-24 characters';
  end if;

  select * into v_group from public.groups
   where code = v_code and expires_at > now();
  if not found then raise exception 'Group not found or it has expired'; end if;

  select count(*) into v_count from public.group_members where group_id = v_group.id;

  if exists (select 1 from public.group_members where group_id = v_group.id and user_id = v_uid) then
    update public.group_members set display_name = v_name
     where group_id = v_group.id and user_id = v_uid;
  else
    if v_count >= 20 then raise exception 'This group is full (20 members max)'; end if;
    insert into public.group_members (group_id, user_id, display_name, color)
    values (v_group.id, v_uid, v_name, v_palette[1 + (v_count % 10)]);
  end if;

  return jsonb_build_object('id', v_group.id, 'code', v_group.code, 'name', v_group.name);
end;
$$;

-- ---------- RPC: server_now (clock-skew correction for freshness) ----------
create or replace function public.server_now()
returns timestamptz
language sql
stable
as $$ select now(); $$;

revoke execute on function public.create_group(text, text) from public, anon;
revoke execute on function public.join_group(text, text)   from public, anon;
revoke execute on function public.server_now()             from public, anon;
grant  execute on function public.create_group(text, text) to authenticated;
grant  execute on function public.join_group(text, text)   to authenticated;
grant  execute on function public.server_now()             to authenticated;

-- ---------- Realtime ----------
alter table public.group_members replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.group_members;
exception when duplicate_object then
  null;
end $$;
