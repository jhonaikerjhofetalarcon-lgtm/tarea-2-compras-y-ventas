-- FERRETEX: un solo rol Administrador, un almacén principal y operaciones atómicas.
alter table public.profiles alter column role set default 'administrador';
update public.profiles set role = 'administrador';
drop policy if exists "admin warehouses read" on public.warehouses;
create policy "admin warehouses read" on public.warehouses for select to authenticated using (true);
create table if not exists public.customer_payments (id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id), sale_id uuid references public.sales(id), amount numeric(12,2) not null check(amount > 0), payment_method text not null default 'efectivo', notes text, user_id uuid references public.profiles(id), created_at timestamptz not null default now());
create table if not exists public.supplier_payments (id uuid primary key default gen_random_uuid(), supplier_id uuid references public.suppliers(id), purchase_id uuid references public.purchases(id), amount numeric(12,2) not null check(amount > 0), payment_method text not null default 'transferencia', notes text, user_id uuid references public.profiles(id), created_at timestamptz not null default now());
create table if not exists public.audit_log (id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id), action text not null, entity text not null, entity_id uuid, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
alter table public.customer_payments enable row level security; alter table public.supplier_payments enable row level security; alter table public.audit_log enable row level security;
create policy "admin customer payments" on public.customer_payments for all to authenticated using (public.current_role() = 'administrador') with check (public.current_role() = 'administrador');
create policy "admin supplier payments" on public.supplier_payments for all to authenticated using (public.current_role() = 'administrador') with check (public.current_role() = 'administrador');
create policy "admin audit" on public.audit_log for all to authenticated using (public.current_role() = 'administrador') with check (public.current_role() = 'administrador');
create policy "admin sales write" on public.sales for insert to authenticated with check (public.current_role() = 'administrador');
create policy "admin sale items write" on public.sale_items for insert to authenticated with check (public.current_role() = 'administrador');
create policy "admin purchases write" on public.purchases for insert to authenticated with check (public.current_role() = 'administrador');
create policy "admin purchase items write" on public.purchase_items for insert to authenticated with check (public.current_role() = 'administrador');

create or replace function public.register_sale(p_customer_id uuid, p_warehouse_id uuid, p_payment_method text, p_items jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare sale_id uuid := gen_random_uuid(); item jsonb; product_stock numeric; sale_total numeric := 0; sale_code text := 'VT-' || to_char(clock_timestamp(),'YYMMDDHH24MISSMS');
begin
  if public.current_role() <> 'administrador' then raise exception 'Solo el administrador puede registrar ventas'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'La venta debe tener productos'; end if;
  insert into sales(id, code, customer_id, user_id, warehouse_id, payment_method, status) values(sale_id, sale_code, p_customer_id, auth.uid(), p_warehouse_id, p_payment_method, case when p_payment_method='credito' then 'pendiente'::payment_status else 'pagado'::payment_status end);
  for item in select * from jsonb_array_elements(p_items) loop
    select quantity into product_stock from stock where product_id=(item->>'product_id')::uuid and warehouse_id=p_warehouse_id for update;
    if coalesce(product_stock,0) < (item->>'quantity')::numeric then raise exception 'Stock insuficiente'; end if;
    insert into sale_items(sale_id, product_id, quantity, unit_price) values(sale_id, (item->>'product_id')::uuid, (item->>'quantity')::numeric, (item->>'unit_price')::numeric);
    sale_total := sale_total + ((item->>'quantity')::numeric * (item->>'unit_price')::numeric);
    update stock set quantity=quantity-(item->>'quantity')::numeric where product_id=(item->>'product_id')::uuid and warehouse_id=p_warehouse_id;
    insert into inventory_movements(product_id, warehouse_id, user_id, movement_type, quantity, reference) values((item->>'product_id')::uuid, p_warehouse_id, auth.uid(), 'salida', (item->>'quantity')::numeric, sale_code);
  end loop;
  update sales set subtotal=sale_total, total=sale_total where id=sale_id;
  insert into audit_log(user_id, action, entity, entity_id, details) values(auth.uid(),'crear','venta',sale_id,jsonb_build_object('code',sale_code,'total',sale_total));
  return sale_id;
end; $$;

create or replace function public.adjust_stock(p_product_id uuid, p_warehouse_id uuid, p_quantity numeric, p_movement_type text, p_reason text) returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_role() <> 'administrador' then raise exception 'Solo el administrador puede ajustar inventario'; end if;
  if p_quantity <= 0 then raise exception 'La cantidad debe ser mayor que cero'; end if;
  if p_movement_type = 'entrada' then update stock set quantity=quantity+p_quantity where product_id=p_product_id and warehouse_id=p_warehouse_id; else update stock set quantity=quantity-p_quantity where product_id=p_product_id and warehouse_id=p_warehouse_id and quantity >= p_quantity; end if;
  if not found then raise exception 'Stock insuficiente o producto no registrado'; end if;
  insert into inventory_movements(product_id, warehouse_id, user_id, movement_type, quantity, reason) values(p_product_id,p_warehouse_id,auth.uid(),p_movement_type,p_quantity,p_reason);
end; $$;
