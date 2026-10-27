-- Jam: a new conversation kind for パート・バンド (teams). In its own migration because a new enum
-- value cannot be used in the same transaction that adds it.
alter type public.conversation_kind add value if not exists 'team';
