create table vehicles (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references tenants(id),
  vehicle_type_id uuid not null references vehicle_types(id),
  plate text not null,
  status text not null default 'active' check (status in ('active','maintenance','inactive')),
  driver_name text,
  driver_phone text,
  version int not null default 1,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_vehicle_plate unique (carrier_id, plate)
)
