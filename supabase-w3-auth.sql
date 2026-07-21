-- Lekcja 07 / Warsztat 3: Supabase Auth i prywatne dane.
-- Uruchom CAŁY plik w Supabase Dashboard -> SQL Editor.

-- Przypisz własność i usuń stare anonimowe rekordy z wcześniejszych warsztatów.
alter table public.conversations add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.documents add column if not exists user_id uuid references auth.users(id) on delete cascade;
delete from public.messages
where conversation_id in (select id from public.conversations where user_id is null);
delete from public.conversations where user_id is null;
delete from public.documents where user_id is null;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.documents enable row level security;
alter table public.user_profiles enable row level security;

drop policy if exists "Users manage own conversations" on public.conversations;
create policy "Users manage own conversations" on public.conversations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users manage messages in own conversations" on public.messages;
create policy "Users manage messages in own conversations" on public.messages
  for all to authenticated
  using (exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
  ));

drop policy if exists "Users manage own documents" on public.documents;
create policy "Users manage own documents" on public.documents
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users manage own profile" on public.user_profiles;
create policy "Users manage own profile" on public.user_profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create index if not exists conversations_user_updated_at_idx
  on public.conversations (user_id, updated_at desc);
create index if not exists documents_user_created_at_idx
  on public.documents (user_id, created_at desc);
