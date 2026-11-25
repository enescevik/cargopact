create table audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  actor_user_id uuid,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  reason text,
  correlation_id text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
)
