-- Lekcja 05 / Warsztat 1: tabele pamieci agenta w Supabase
-- Uruchom ten plik w Supabase Dashboard -> SQL Editor.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid,
  title text,
  updated_at timestamptz not null default now()
);

alter table public.conversations disable row level security;

-- Dla tabeli utworzonej we wczesniejszej wersji warsztatu.
alter table public.conversations add column if not exists user_id uuid;
create index if not exists conversations_user_updated_at_idx
  on public.conversations (user_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  role text,
  content text
);

alter table public.messages disable row level security;

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  preferences jsonb not null default '{}'::jsonb
);

alter table public.user_profiles disable row level security;

-- Szybka weryfikacja: powinny pojawic sie 3 wiersze z liczba 0.
select 'conversations' as table_name, count(*) as rows_count from public.conversations
union all
select 'messages' as table_name, count(*) as rows_count from public.messages
union all
select 'user_profiles' as table_name, count(*) as rows_count from public.user_profiles;
