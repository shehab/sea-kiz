create table if not exists public.rounds (
  id text primary key,
  status text not null default 'voting' check (status in ('voting', 'locked', 'revealing', 'revealed')),
  reveal_started_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  id bigint generated always as identity primary key,
  round_id text not null references public.rounds(id) on delete cascade,
  voter_name text not null,
  name_option text not null,
  score integer not null check (score between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, voter_name, name_option)
);

alter table public.rounds enable row level security;
alter table public.votes enable row level security;

drop policy if exists "Rounds are readable" on public.rounds;
drop policy if exists "Rounds can be created from the app" on public.rounds;
drop policy if exists "Rounds can be updated from the host page" on public.rounds;
drop policy if exists "Votes are readable for live status and reveal" on public.votes;
drop policy if exists "Votes can be submitted from the app" on public.votes;
drop policy if exists "Votes can be updated from the app" on public.votes;
drop policy if exists "Votes can be reset from the host page" on public.votes;

create policy "Rounds are readable" on public.rounds
  for select using (true);

create policy "Rounds can be created from the app" on public.rounds
  for insert with check (true);

create policy "Rounds can be updated from the host page" on public.rounds
  for update using (true) with check (true);

create policy "Votes are readable for live status and reveal" on public.votes
  for select using (true);

create policy "Votes can be submitted from the app" on public.votes
  for insert with check (true);

create policy "Votes can be updated from the app" on public.votes
  for update using (true) with check (true);

create policy "Votes can be reset from the host page" on public.votes
  for delete using (true);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists votes_set_updated_at on public.votes;
create trigger votes_set_updated_at
before update on public.votes
for each row execute function public.set_updated_at();
