create table carrier_product_classes (
  carrier_id uuid not null references tenants(id),
  product_class_id uuid not null references product_classes(id),
  accepted boolean not null default true,
  is_demo boolean not null default false,
  primary key (carrier_id, product_class_id)
)
