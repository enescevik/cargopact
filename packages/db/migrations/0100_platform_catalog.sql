insert into tenants (id, type, name, status) values ('00000000-0000-4000-8000-000000000001', 'platform', 'CargoPact Platform', 'active');

insert into vehicle_types (tenant_id, code, name, pallet_positions, max_payload_kg, cargo_volume_m3, inner_length_mm, inner_width_mm, inner_height_mm) values
 ('00000000-0000-4000-8000-000000000001', 'TIR-136', 'Tır (13,6 m tenteli)', 33, 24000, 86.00, 13600, 2450, 2700),
 ('00000000-0000-4000-8000-000000000001', 'KAMYON-10T', 'Kamyon (10 tekerli)', 18, 10000, 45.00, 8200, 2450, 2500),
 ('00000000-0000-4000-8000-000000000001', 'KAMYONET', 'Kamyonet', 6, 3000, 14.00, 4200, 2000, 1800);

insert into packaging_types (tenant_id, code, name, kind, length_mm, width_mm, height_mm, max_gross_kg, usable_volume_m3, fill_factor) values
 ('00000000-0000-4000-8000-000000000001', 'EUR-PALET', 'EUR palet (120x80)', 'pallet', 1200, 800, 1800, 1000, 1.728, 0.80),
 ('00000000-0000-4000-8000-000000000001', 'END-PALET', 'Endüstriyel palet (120x100)', 'pallet', 1200, 1000, 1800, 1000, 2.160, 0.80);

insert into packaging_types (tenant_id, code, name, kind, length_mm, width_mm, height_mm, max_gross_kg) values
 ('00000000-0000-4000-8000-000000000001', 'KOLI-S', 'Koli küçük (30x20x20)', 'carton', 300, 200, 200, 5),
 ('00000000-0000-4000-8000-000000000001', 'KOLI-M', 'Koli orta (40x30x30)', 'carton', 400, 300, 300, 12),
 ('00000000-0000-4000-8000-000000000001', 'KOLI-L', 'Koli büyük (60x40x40)', 'carton', 600, 400, 400, 20);

insert into product_classes (tenant_id, code, name, special_handling) values
 ('00000000-0000-4000-8000-000000000001', 'GENEL', 'Genel kuru yük', false),
 ('00000000-0000-4000-8000-000000000001', 'GIDA-AMBALAJLI', 'Ambalajlı gıda', false),
 ('00000000-0000-4000-8000-000000000001', 'KIRILGAN', 'Kırılgan yük', true),
 ('00000000-0000-4000-8000-000000000001', 'TEHLIKELI', 'Tehlikeli madde (ADR)', true);
