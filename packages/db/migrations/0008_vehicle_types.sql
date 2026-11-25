create table vehicle_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  code text not null,
  name text not null,
  pallet_positions int not null check (pallet_positions > 0),
  max_payload_kg int not null check (max_payload_kg > 0),
  cargo_volume_m3 numeric(6,2) not null check (cargo_volume_m3 > 0),
  inner_length_mm int,
  inner_width_mm int,
  inner_height_mm int,
  stackable boolean not null default false,
  status text not null default 'active' check (status in ('active','inactive')),
  version int not null default 1,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_vehicle_type_code unique (tenant_id, code)
)
