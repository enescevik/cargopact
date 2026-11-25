create table warehouse_measurements (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id),
  declared_pallets int not null,
  declared_kg int not null,
  measured_pallets int not null check (measured_pallets >= 0),
  measured_kg int not null check (measured_kg >= 0),
  measured_height_mm int,
  diff_kg int not null,
  diff_pallets int not null,
  outcome text not null check (outcome in ('ok','review','partial','rejected')),
  note text,
  actor_user_id uuid,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
)
