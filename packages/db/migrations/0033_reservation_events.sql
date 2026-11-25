create table reservation_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id),
  type text not null,
  note text,
  actor_user_id uuid,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  constraint uq_reservation_event unique (reservation_id, type)
)
