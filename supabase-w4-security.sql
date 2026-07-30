-- Lekcja 10 / Warsztat 4: panel bezpieczeństwa.
-- Uruchom cały plik w Supabase Dashboard -> SQL Editor.
create table if not exists public.message_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  message text not null,
  message_length integer not null check (message_length >= 0),
  blocked boolean not null default false,
  block_reason text
);

alter table public.message_logs enable row level security;
create index if not exists message_logs_blocked_created_at_idx
  on public.message_logs (blocked, created_at desc);
create index if not exists message_logs_user_created_at_idx
  on public.message_logs (user_id, created_at desc);
