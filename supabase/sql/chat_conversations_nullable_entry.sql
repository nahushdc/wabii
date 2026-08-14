-- New-entry "Chat" mode starts a conversation before a journal entry exists yet
-- (the entry is only created once the user hits Save). Allow entry_id to be
-- null while the conversation is in progress; the journal-chat function links
-- it to the entry afterward.
alter table chat_conversations alter column entry_id drop not null;
