-- Lekcja 09 / Warsztat 3: webhook i analiza zdarzeń.
-- Uruchom cały plik ręcznie w Supabase Dashboard -> SQL Editor.
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null check (type in ('feedback', 'alert', 'order')),
  data jsonb not null,
  analysis text not null
);

alter table public.webhook_events enable row level security;
create index if not exists webhook_events_created_at_idx on public.webhook_events (created_at desc);
