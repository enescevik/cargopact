create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id),
  type text not null check (type in ('AUTHORIZED','CAPTURED','RELEASED','REFUNDED','RETAINED','FAILED')),
  amount_minor bigint not null check (amount_minor >= 0),
  reason text not null,
  idempotency_key text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  constraint uq_ledger_idem unique (idempotency_key)
)
