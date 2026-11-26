-- Found rizz tier lists. Run once in Supabase → SQL Editor → New query → Run.
-- Each browser ranks a foundry's fonts S/A/B/C/D; one tier per browser per font (ranking again replaces it).
-- Visitors can only call rate_tiers() and read the totals per font; they can't read who rated what.

create table if not exists public.tier_votes (
  font_id    text not null check (char_length(font_id) between 1 and 200),
  voter      uuid not null,
  tier       smallint not null check (tier between 1 and 5),   -- 5 = S, 4 = A, 3 = B, 2 = C, 1 = D
  updated_at timestamptz not null default now(),
  primary key (font_id, voter)
);
alter table public.tier_votes enable row level security;   -- no policies = no direct access for visitors
revoke all on public.tier_votes from anon, authenticated;

create or replace view public.tier_scores as
  select font_id, count(*)::int as n, sum(tier)::int as total from public.tier_votes group by font_id;
grant select on public.tier_scores to anon, authenticated;

-- p_ratings: [{"f": "<font id>", "t": 1..5}, …], at most 40 per call
create or replace function public.rate_tiers(p_voter uuid, p_ratings jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(p_ratings) <> 'array' or jsonb_array_length(p_ratings) > 40 then
    raise exception 'between 0 and 40 ratings';
  end if;
  insert into public.tier_votes (font_id, voter, tier)
    select r->>'f', p_voter, (r->>'t')::smallint from jsonb_array_elements(p_ratings) r
  on conflict (font_id, voter) do update set tier = excluded.tier, updated_at = now();
end;
$$;

revoke all on function public.rate_tiers(uuid, jsonb) from public;
grant execute on function public.rate_tiers(uuid, jsonb) to anon, authenticated;
