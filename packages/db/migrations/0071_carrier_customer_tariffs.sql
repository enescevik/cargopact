create table carrier_customer_tariffs (
  id uuid primary key,
  carrier_id uuid not null references tenants(id),
  customer_id uuid not null references tenants(id),
  trip_id uuid references trips(id),
  base_price_minor bigint not null check (base_price_minor > 0),
  valid_from timestamptz,
  valid_to timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
)
