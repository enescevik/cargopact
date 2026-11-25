create table exception_resolutions (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references tenants(id),
  exception_id text not null,
  note text not null,
  resolved_by uuid,
  resolved_at timestamptz not null default now(),
  is_demo boolean not null default false,
  constraint uq_exception_resolution unique (carrier_id, exception_id)
)
