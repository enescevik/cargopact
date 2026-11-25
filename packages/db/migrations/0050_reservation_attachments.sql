create table reservation_attachments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id),
  carrier_id uuid not null references tenants(id),
  kind text not null check (kind in ('photo','signature')),
  s3_key text not null,
  content_type text not null,
  attached boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  constraint uq_reservation_attachment_key unique (s3_key)
)
