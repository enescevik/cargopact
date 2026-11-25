create table quote_requests (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null,
  customer_id uuid not null,
  trip_id uuid not null,
  pallets int not null,
  gross_kg int not null,
  eligible boolean not null,
  unit_price_minor bigint not null,
  created_at timestamptz not null default now(),
  is_demo boolean not null default false
)
