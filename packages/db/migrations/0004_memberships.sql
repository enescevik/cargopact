create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  tenant_id uuid not null references tenants(id),
  role text not null check (role in ('customer_user','carrier_admin','carrier_planner','carrier_warehouse','admin_viewer','platform_admin')),
  status text not null default 'active' check (status in ('active','inactive')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  constraint uq_membership unique (user_id, tenant_id)
)
