create table wms_pallet_events (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references tenants(id),
  reservation_id uuid not null references reservations(id),
  pallet_code text not null,
  event_type text not null check (event_type in ('RECEIVED','LOADED','ARRIVED','DELIVERED')),
  occurred_at timestamptz not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  constraint uq_wms_pallet_event unique (pallet_code, event_type)
)
