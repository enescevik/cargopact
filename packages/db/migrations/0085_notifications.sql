create table notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  audience text not null check (audience in ('customer','carrier')),
  reservation_id uuid,
  trip_id uuid,
  type text not null,
  title text not null,
  body text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  is_demo boolean not null default false
)
