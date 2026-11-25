create table agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  correlation_id text not null,
  session_id text,
  tenant_id uuid not null,
  user_id uuid not null,
  method text not null,
  path text not null,
  status integer not null,
  ms integer not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
)
