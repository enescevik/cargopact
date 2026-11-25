create table contract_acceptances (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique,
  customer_id uuid not null,
  user_id uuid,
  signer_name text not null,
  contract_code text not null,
  version text not null,
  rendered_hash text not null,
  rendered_markdown text not null,
  ip text,
  user_agent text,
  accepted_at timestamptz not null default now(),
  is_demo boolean not null default false
)
