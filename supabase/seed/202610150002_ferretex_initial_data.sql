-- Datos iniciales de FERRETEX. Los precios son referenciales y deben
-- actualizarse según el proveedor. No elimina registros existentes.

insert into public.categories (name)
values
  ('Construcción'),
  ('Herramientas'),
  ('Pinturas'),
  ('Electricidad'),
  ('Gasfitería'),
  ('Seguridad industrial')
on conflict (name) do update set active = true;

insert into public.warehouses (name, address)
values ('Almacén principal', 'Sede principal FERRETEX')
on conflict do nothing;

insert into public.products (sku, barcode, name, category_id, unit, purchase_price, sale_price, min_stock)
select v.sku, v.barcode, v.name, c.id, v.unit, v.purchase_price, v.sale_price, v.min_stock
from (values
  ('001', null::text, 'Cemento Portland Tipo I 42.5 kg', 'Construcción', 'bolsa', 24.50, 29.90, 30),
  ('002', null::text, 'Barra de acero corrugado 1/2 pulgada x 9 m', 'Construcción', 'unidad', 32.00, 38.50, 20),
  ('003', null::text, 'Pintura látex blanco 4 L', 'Pinturas', 'balde', 54.00, 67.90, 15),
  ('004', null::text, 'Taladro percutor 650 W', 'Herramientas', 'unidad', 150.00, 189.00, 5),
  ('005', null::text, 'Tubo PVC desagüe 4 pulgadas x 3 m', 'Gasfitería', 'unidad', 25.00, 32.00, 10),
  ('006', null::text, 'Cable mellizo calibre 14 x 100 m', 'Electricidad', 'rollo', 115.00, 145.00, 4),
  ('007', null::text, 'Martillo de uña 16 oz', 'Herramientas', 'unidad', 18.00, 26.90, 8),
  ('008', null::text, 'Guantes de seguridad reforzados', 'Seguridad industrial', 'par', 7.50, 12.00, 20)) as v(sku, barcode, name, category, unit, purchase_price, sale_price, min_stock)
join public.categories c on c.name = v.category
on conflict (sku) do update set
  barcode = excluded.barcode,
  name = excluded.name,
  category_id = excluded.category_id,
  unit = excluded.unit,
  purchase_price = excluded.purchase_price,
  sale_price = excluded.sale_price,
  min_stock = excluded.min_stock,
  active = true,
  updated_at = now();

insert into public.stock (product_id, warehouse_id, quantity)
select p.id, w.id, v.quantity
from (values
  ('001', 24::numeric), ('002', 86::numeric), ('003', 12::numeric),
  ('004', 0::numeric), ('005', 48::numeric), ('006', 16::numeric),
  ('007', 10::numeric), ('008', 35::numeric)
) as v(sku, quantity)
join public.products p on p.sku = v.sku
cross join (select id from public.warehouses where name = 'Almacén principal' limit 1) w
on conflict (product_id, warehouse_id) do update set quantity = excluded.quantity;
