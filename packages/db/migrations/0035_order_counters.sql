create table order_counters (
  year int primary key,
  last_value int not null default 0
)
