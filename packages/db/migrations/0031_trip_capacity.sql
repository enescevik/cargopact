create table trip_capacity (
  trip_id uuid primary key references trips(id),
  held_pallets int not null default 0 check (held_pallets >= 0),
  held_kg int not null default 0 check (held_kg >= 0),
  held_m3 numeric(8,2) not null default 0 check (held_m3 >= 0),
  confirmed_pallets int not null default 0 check (confirmed_pallets >= 0),
  confirmed_kg int not null default 0 check (confirmed_kg >= 0),
  confirmed_m3 numeric(8,2) not null default 0 check (confirmed_m3 >= 0),
  loaded_pallets int not null default 0 check (loaded_pallets >= 0),
  loaded_kg int not null default 0 check (loaded_kg >= 0),
  is_demo boolean not null default false,
  version int not null default 1,
  updated_at timestamptz not null default now()
)
