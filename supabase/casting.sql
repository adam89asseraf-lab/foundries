-- Found rizz Casting Call. Run once in Supabase → SQL Editor → New query → Run.
-- Each round shows one role and 4 fonts from one category; the player picks the star (best) and the flop (worst).
-- That's best–worst scaling: per role, a font's score is (times best − times worst) / times shown.
-- One answer per browser per role per set of 4 fonts (answering the same set again replaces it).
-- Visitors can only call cast_vote() and read the totals; they can't read who picked what.

create table if not exists public.cast_votes (
  role       text not null check (char_length(role) between 1 and 160),
  voter      uuid not null,
  shown_key  text not null,                 -- the 4 font ids, sorted and joined with '|'
  shown      text[] not null,
  best       text not null,
  worst      text not null,
  category   text,
  updated_at timestamptz not null default now(),
  primary key (role, voter, shown_key)
);
alter table public.cast_votes enable row level security;   -- no policies = no direct access for visitors
revoke all on public.cast_votes from anon, authenticated;

-- per role and font: how often it was shown, picked as the star, picked as the flop
create or replace view public.cast_scores as
  select v.role, f.font_id, count(*)::int as shown,
         count(*) filter (where v.best = f.font_id)::int as best,
         count(*) filter (where v.worst = f.font_id)::int as worst
  from public.cast_votes v cross join lateral unnest(v.shown) as f(font_id)
  group by v.role, f.font_id;
grant select on public.cast_scores to anon, authenticated;

-- per font across all roles (for matchmaking and the nightly per-font scores)
create or replace view public.cast_font_scores as
  select font_id, sum(shown)::int as shown, sum(best)::int as best, sum(worst)::int as worst
  from public.cast_scores group by font_id;
grant select on public.cast_font_scores to anon, authenticated;

create or replace function public.cast_vote(p_voter uuid, p_role text, p_shown text[], p_best text, p_worst text, p_category text default null)
returns void language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if array_length(p_shown, 1) is distinct from 4 then raise exception 'show exactly 4 fonts'; end if;
  if (select count(distinct x) from unnest(p_shown) x) <> 4 then raise exception 'fonts must differ'; end if;
  if exists (select 1 from unnest(p_shown) x where char_length(x) not between 1 and 200) then raise exception 'bad font id'; end if;
  if p_best = p_worst or not (p_best = any(p_shown)) or not (p_worst = any(p_shown)) then raise exception 'best and worst must be two of the shown fonts'; end if;
  select string_agg(x, '|' order by x) into k from unnest(p_shown) x;
  insert into public.cast_votes (role, voter, shown_key, shown, best, worst, category)
    values (p_role, p_voter, k, p_shown, p_best, p_worst, left(p_category, 40))
  on conflict (role, voter, shown_key) do update set best = excluded.best, worst = excluded.worst, updated_at = now();
end;
$$;

revoke all on function public.cast_vote(uuid, text, text[], text, text, text) from public;
grant execute on function public.cast_vote(uuid, text, text[], text, text, text) to anon, authenticated;
