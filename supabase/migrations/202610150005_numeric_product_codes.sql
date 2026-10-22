-- FERRETEX: normaliza los códigos visibles de los productos.
-- Se conservan los UUID y las relaciones de inventario, compras y ventas.
-- Los productos iniciales pasan de CEM-001, FIE-024, etc. a 001, 002, etc.

create temporary table ferretex_product_code_map
on commit drop
as
with source as (
  select
    id,
    sku,
    created_at,
    case sku
      when 'CEM-001' then '001'
      when 'FIE-024' then '002'
      when 'PIN-118' then '003'
      when 'HER-056' then '004'
      when 'TUB-203' then '005'
      when 'ELE-071' then '006'
      when 'HER-084' then '007'
      when 'SEG-011' then '008'
    end as fixed_code
  from public.products
),
remaining as (
  select
    id,
    lpad((8 + row_number() over (order by created_at, id))::text, 3, '0') as generated_code
  from source
  where fixed_code is null
)
select source.id, coalesce(source.fixed_code, remaining.generated_code) as code
from source
left join remaining using (id);

-- Evita conflictos momentáneos con la restricción unique de products.sku.
update public.products
set sku = 'TMP-' || id::text;

update public.products as product
set sku = code_map.code
from ferretex_product_code_map as code_map
where product.id = code_map.id;

-- Reemplaza los códigos de barras de ejemplo y deja nombres claros de catálogo.
update public.products as product
set
  barcode = null,
  name = case code_map.code
    when '001' then 'Cemento Portland Tipo I 42.5 kg'
    when '002' then 'Barra de acero corrugado 1/2 pulgada x 9 m'
    when '003' then 'Pintura látex blanco 4 L'
    when '004' then 'Taladro percutor 650 W'
    when '005' then 'Tubo PVC desagüe 4 pulgadas x 3 m'
    when '006' then 'Cable mellizo calibre 14 x 100 m'
    when '007' then 'Martillo de uña 16 oz'
    when '008' then 'Guantes de seguridad reforzados'
    else product.name
  end
from ferretex_product_code_map as code_map
where product.id = code_map.id
  and code_map.code in ('001', '002', '003', '004', '005', '006', '007', '008');
