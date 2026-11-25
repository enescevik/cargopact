create table idempotency_keys (
  tenant_id uuid not null,
  scope text not null,
  key text not null,
  request_hash text not null,
  status_code int not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, scope, key)
)
