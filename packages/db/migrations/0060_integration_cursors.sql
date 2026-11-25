create table integration_cursors (
  carrier_id uuid primary key references tenants(id),
  last_created_at timestamptz not null,
  last_audit_id uuid not null,
  published_count bigint not null default 0,
  last_published_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
)
