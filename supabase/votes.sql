-- Found rizz font votes. Run once in Supabase → SQL Editor → New query → Run.
-- Anonymous upvotes: one per browser per font. Visitors can only call vote()/unvote() and read totals;
-- they can't read who voted or touch the table directly.

create table if not exists public.votes (
  font_id    text not null check (char_length(font_id) between 1 and 200),
  voter      uuid not null,
  created_at timestamptz not null default now(),
  primary key (font_id, voter)
);
alter table public.votes enable row level security;   -- no policies = no direct access for visitors
revoke all on public.votes from anon, authenticated;

create or replace view public.vote_counts as
  select font_id, count(*)::int as n from public.votes group by font_id;
grant select on public.vote_counts to anon, authenticated;

create or replace function public.vote(p_font text, p_voter uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.votes (font_id, voter) values (p_font, p_voter) on conflict do nothing;
$$;

create or replace function public.unvote(p_font text, p_voter uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.votes where font_id = p_font and voter = p_voter;
$$;

revoke all on function public.vote(text, uuid), public.unvote(text, uuid) from public;
grant execute on function public.vote(text, uuid), public.unvote(text, uuid) to anon, authenticated;
