create table product_classes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  code text not null,
  name text not null,
  special_handling boolean not null default false,
  status text not null default 'active' check (status in ('active','inactive')),
  version int not null default 1,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_product_class_code unique (tenant_id, code)
)
