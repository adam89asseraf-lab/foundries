-- Found rizz: your own sentence in paid fonts (Compare screen).
-- Visitors queue a sentence for up to 6 fonts; a GitHub job draws it on each foundry's own page in that
-- font's webfont and uploads a picture to the public "previews" bucket. The same sentence + font is drawn once
-- and reused for everyone.
--
-- Setup, once:
--   1. Run this whole file in Supabase → SQL Editor → New query → Run.
--   2. Store a GitHub token so a request can start the job right away (fine-grained token, only the
--      "foundries" repo, permission Actions: Read and write). In a new query, with your token in place of the dots:
--        select vault.create_secret('github_pat_…', 'github_token');
--   3. In GitHub → repo Settings → Secrets and variables → Actions, add SUPABASE_SERVICE_KEY
--      (Supabase → Project Settings → API keys → the service_role / secret key).

create extension if not exists pg_net;

create table if not exists public.previews (
  id         uuid primary key default gen_random_uuid(),
  font_id    text not null check (char_length(font_id) between 1 and 200),
  body       text not null check (char_length(body) between 1 and 80),
  status     text not null default 'queued' check (status in ('queued', 'done', 'failed')),
  image      text,                                  -- public URL of the picture when done
  error      text,
  created_at timestamptz not null default now(),
  done_at    timestamptz,
  unique (font_id, body)
);
alter table public.previews enable row level security;   -- no policies = no direct access for visitors
revoke all on public.previews from anon, authenticated;

-- when the job was last started, so a burst of requests starts it once
create table if not exists public.preview_dispatch (id int primary key default 1 check (id = 1), at timestamptz);
alter table public.preview_dispatch enable row level security;
revoke all on public.preview_dispatch from anon, authenticated;

insert into storage.buckets (id, name, public) values ('previews', 'previews', true) on conflict (id) do nothing;

-- queue a sentence for some fonts; returns every row (already drawn ones straight away)
create or replace function public.request_previews(p_fonts text[], p_body text)
returns table (id uuid, font_id text, status text, image text, error text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  t text := btrim(regexp_replace(p_body, '\s+', ' ', 'g'));
  token text;
  added int;
begin
  if t is null or char_length(t) = 0 or char_length(t) > 80 then raise exception 'sentence must be 1–80 characters'; end if;
  if p_fonts is null or cardinality(p_fonts) = 0 or cardinality(p_fonts) > 6 then raise exception '1–6 fonts'; end if;
  if (select count(*) from public.previews p where p.status = 'queued') > 300 then raise exception 'busy, try again in a few minutes'; end if;
  -- a failed one is tried again after a day
  update public.previews p set status = 'queued', error = null, created_at = now()
    where p.body = t and p.font_id = any(p_fonts) and p.status = 'failed' and p.done_at < now() - interval '1 day';
  insert into public.previews (font_id, body) select distinct f, t from unnest(p_fonts) f on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 or exists (select 1 from public.previews p where p.body = t and p.font_id = any(p_fonts) and p.status = 'queued') then
    -- start the GitHub job, at most every 20 seconds (a running job keeps picking up new rows)
    if not exists (select 1 from public.preview_dispatch d where d.at > now() - interval '20 seconds') then
      insert into public.preview_dispatch (id, at) values (1, now()) on conflict (id) do update set at = now();
      select decrypted_secret into token from vault.decrypted_secrets where name = 'github_token' limit 1;
      if token is not null then
        perform net.http_post(
          url := 'https://api.github.com/repos/adam89asseraf-lab/foundries/actions/workflows/previews.yml/dispatches',
          headers := jsonb_build_object('Authorization', 'Bearer ' || token, 'Accept', 'application/vnd.github+json',
                                        'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'foundrizz-previews'),
          body := jsonb_build_object('ref', 'main'));
      end if;
    end if;
  end if;
  return query select p.id, p.font_id, p.status, p.image, p.error from public.previews p where p.body = t and p.font_id = any(p_fonts);
end;
$$;

-- check on queued ones
create or replace function public.get_previews(p_ids uuid[])
returns table (id uuid, font_id text, status text, image text, error text)
language sql security definer set search_path = public as $$
  select p.id, p.font_id, p.status, p.image, p.error from public.previews p where p.id = any(p_ids[1:12]);
$$;

revoke all on function public.request_previews(text[], text), public.get_previews(uuid[]) from public;
grant execute on function public.request_previews(text[], text), public.get_previews(uuid[]) to anon, authenticated;
