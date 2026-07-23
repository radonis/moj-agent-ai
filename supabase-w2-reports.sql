-- Lekcja 08 / Warsztat 2: prywatny zapis wygenerowanych raportów.
-- Uruchom cały plik w Supabase Dashboard -> SQL Editor.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists "Users manage own reports" on public.reports;
create policy "Users manage own reports" on public.reports for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists reports_user_created_at_idx on public.reports (user_id, created_at desc);
