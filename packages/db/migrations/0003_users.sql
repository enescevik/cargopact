create table users (
  id uuid primary key default gen_random_uuid(),
  cognito_sub text not null,
  email text not null,
  display_name text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  constraint uq_users_sub unique (cognito_sub),
  constraint uq_users_email unique (email)
)
