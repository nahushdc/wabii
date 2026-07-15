-- Chat companion feature: one continuing conversation thread per journal entry.

create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references journal_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_id)
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_conversation_id_idx on chat_messages(conversation_id, created_at);

alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;

create policy "select own conversations" on chat_conversations
  for select using (user_id = auth.uid());

create policy "select own messages" on chat_messages
  for select using (
    exists (select 1 from chat_conversations c
            where c.id = chat_messages.conversation_id and c.user_id = auth.uid())
  );

-- No insert/update/delete policies: all writes go through the `chat` edge function
-- using the service role key, which resolves the caller via their JWT itself.
