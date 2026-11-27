-- Found rizz admin: font fixes (category, name, hide) made on admin.html.
-- Run once in Supabase → SQL Editor → New query → Run. Then follow the setup steps in README.md
-- (create your own login under Authentication → Users, and add it to public.admins).
--
-- Everyone can READ the fixes (the public site applies them). Only signed-in users listed in public.admins can WRITE.

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;   -- no policies: nobody reads or edits this list through the API
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table if not exists public.font_overrides (
  font_id    text primary key check (char_length(font_id) between 3 and 200 and font_id like '%--%'),
  category   text check (category in ('Sans', 'Serif', 'Slab', 'Mono', 'Display', 'Script')),
  name       text check (char_length(name) between 1 and 120),
  hidden     boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.font_overrides enable row level security;

drop policy if exists "anyone reads font fixes" on public.font_overrides;
create policy "anyone reads font fixes" on public.font_overrides for select to anon, authenticated using (true);
drop policy if exists "admins add font fixes" on public.font_overrides;
create policy "admins add font fixes" on public.font_overrides for insert to authenticated with check (public.is_admin());
drop policy if exists "admins change font fixes" on public.font_overrides;
create policy "admins change font fixes" on public.font_overrides for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins remove font fixes" on public.font_overrides;
create policy "admins remove font fixes" on public.font_overrides for delete to authenticated using (public.is_admin());

revoke all on public.font_overrides from anon, authenticated;
grant select on public.font_overrides to anon, authenticated;
grant insert, update, delete on public.font_overrides to authenticated;

-- keep updated_at / updated_by honest on every change
create or replace function public.touch_font_override() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end;
$$;
drop trigger if exists touch_font_override on public.font_overrides;
create trigger touch_font_override before insert or update on public.font_overrides
  for each row execute function public.touch_font_override();
