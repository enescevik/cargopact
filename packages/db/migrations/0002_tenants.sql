create table tenants (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('platform','carrier','customer')),
  name text not null,
  status text not null check (status in ('pending','active','suspended')),
  tax_no text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
)
