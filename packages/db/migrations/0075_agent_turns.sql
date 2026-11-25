create table agent_turns (
  correlation_id text primary key,
  session_id text,
  tenant_id uuid not null,
  user_id uuid not null,
  user_role text,
  latency_ms integer,
  reply_chars integer,
  ok boolean,
  completed_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
)
