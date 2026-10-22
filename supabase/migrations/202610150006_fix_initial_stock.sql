-- FERRETEX: corrige el registro de stock inicial y las entradas.
-- Ejecutar después de las migraciones anteriores en Supabase SQL Editor.

create or replace function public.adjust_stock(
  p_product_id uuid,
  p_warehouse_id uuid,
  p_quantity numeric,
  p_movement_type text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() <> 'administrador' then
    raise exception 'Solo el administrador puede ajustar inventario';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor que cero';
  end if;

  if p_movement_type not in ('entrada', 'salida') then
    raise exception 'El tipo de movimiento no es válido';
  end if;

  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Producto no registrado';
  end if;

  if not exists (select 1 from public.warehouses where id = p_warehouse_id) then
    raise exception 'Almacén no registrado';
  end if;

  if p_movement_type = 'entrada' then
    insert into public.stock as target_stock(product_id, warehouse_id, quantity)
    values (p_product_id, p_warehouse_id, p_quantity)
    on conflict (product_id, warehouse_id) do update
      set quantity = target_stock.quantity + excluded.quantity;
  else
    update public.stock
    set quantity = quantity - p_quantity
    where product_id = p_product_id
      and warehouse_id = p_warehouse_id
      and quantity >= p_quantity;

    if not found then
      raise exception 'Stock insuficiente o producto sin existencia registrada';
    end if;
  end if;

  insert into public.inventory_movements(
    product_id,
    warehouse_id,
    user_id,
    movement_type,
    quantity,
    reason
  )
  values (
    p_product_id,
    p_warehouse_id,
    auth.uid(),
    p_movement_type,
    p_quantity,
    nullif(trim(coalesce(p_reason, '')), '')
  );
end;
$$;

grant execute on function public.adjust_stock(uuid, uuid, numeric, text, text) to authenticated;
