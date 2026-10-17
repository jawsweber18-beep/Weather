-- Per-user Quorum settings (saved place, recent places, units, theme, hidden
-- forecast sources), stored as one JSON document per account.
create table if not exists user_prefs (
  user_id text primary key references "user" ("id") on delete cascade,
  prefs jsonb not null,
  updated_at timestamptz not null default now()
);
