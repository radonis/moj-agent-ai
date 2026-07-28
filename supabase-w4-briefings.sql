-- Lekcja 09 / Warsztat 4: briefing automatyczny.
-- Uruchom cały plik ręcznie w Supabase Dashboard -> SQL Editor.
create table if not exists public.briefings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  content text not null,
  date date not null default current_date
);
alter table public.briefings enable row level security;
drop policy if exists "Authenticated users can read briefings" on public.briefings;
create policy "Authenticated users can read briefings" on public.briefings for select to authenticated using (true);
create index if not exists briefings_created_at_idx on public.briefings (created_at desc);
