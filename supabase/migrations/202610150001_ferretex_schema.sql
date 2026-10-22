create extension if not exists "pgcrypto";

create type public.app_role as enum ('administrador','vendedor','compras','almacenero');
create type public.payment_status as enum ('pendiente','parcial','pagado','anulado');

create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, full_name text not null, role public.app_role not null default 'vendedor', phone text, active boolean not null default true, created_at timestamptz not null default now());
create table public.categories (id uuid primary key default gen_random_uuid(), name text not null unique, active boolean not null default true, created_at timestamptz not null default now());
create table public.products (id uuid primary key default gen_random_uuid(), sku text not null unique, barcode text unique, name text not null, category_id uuid references public.categories(id), unit text not null default 'unidad', purchase_price numeric(12,2) not null default 0 check (purchase_price >= 0), sale_price numeric(12,2) not null default 0 check (sale_price >= 0), min_stock numeric(12,3) not null default 0 check (min_stock >= 0), active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.customers (id uuid primary key default gen_random_uuid(), document text unique, name text not null, phone text, email text, address text, credit_limit numeric(12,2) not null default 0, active boolean not null default true, created_at timestamptz not null default now());
create table public.suppliers (id uuid primary key default gen_random_uuid(), ruc text not null unique, business_name text not null, contact_name text, phone text, email text, address text, payment_terms text, active boolean not null default true, created_at timestamptz not null default now());
create table public.warehouses (id uuid primary key default gen_random_uuid(), name text not null, address text, active boolean not null default true, created_at timestamptz not null default now());
create table public.stock (product_id uuid references public.products(id) on delete cascade, warehouse_id uuid references public.warehouses(id) on delete cascade, quantity numeric(12,3) not null default 0 check (quantity >= 0), primary key(product_id, warehouse_id));
create table public.sales (id uuid primary key default gen_random_uuid(), code text not null unique, customer_id uuid references public.customers(id), user_id uuid references public.profiles(id), warehouse_id uuid references public.warehouses(id), subtotal numeric(12,2) not null default 0, discount numeric(12,2) not null default 0, tax numeric(12,2) not null default 0, total numeric(12,2) not null default 0, payment_method text not null default 'efectivo', status public.payment_status not null default 'pagado', created_at timestamptz not null default now());
create table public.sale_items (id uuid primary key default gen_random_uuid(), sale_id uuid references public.sales(id) on delete cascade, product_id uuid references public.products(id), quantity numeric(12,3) not null check(quantity > 0), unit_price numeric(12,2) not null check(unit_price >= 0), subtotal numeric(12,2) generated always as (quantity * unit_price) stored);
create table public.purchases (id uuid primary key default gen_random_uuid(), code text not null unique, supplier_id uuid references public.suppliers(id), user_id uuid references public.profiles(id), warehouse_id uuid references public.warehouses(id), total numeric(12,2) not null default 0, status text not null default 'pendiente', created_at timestamptz not null default now());
create table public.purchase_items (id uuid primary key default gen_random_uuid(), purchase_id uuid references public.purchases(id) on delete cascade, product_id uuid references public.products(id), quantity numeric(12,3) not null check(quantity > 0), unit_cost numeric(12,2) not null check(unit_cost >= 0));
create table public.inventory_movements (id uuid primary key default gen_random_uuid(), product_id uuid references public.products(id), warehouse_id uuid references public.warehouses(id), user_id uuid references public.profiles(id), movement_type text not null, quantity numeric(12,3) not null check(quantity > 0), reference text, reason text, created_at timestamptz not null default now());

create index products_name_idx on public.products using gin (to_tsvector('spanish', name));
create index movements_product_date_idx on public.inventory_movements(product_id, created_at desc);

alter table public.profiles enable row level security; alter table public.categories enable row level security; alter table public.products enable row level security; alter table public.customers enable row level security; alter table public.suppliers enable row level security; alter table public.warehouses enable row level security; alter table public.stock enable row level security; alter table public.sales enable row level security; alter table public.sale_items enable row level security; alter table public.purchases enable row level security; alter table public.purchase_items enable row level security; alter table public.inventory_movements enable row level security;

create or replace function public.current_role() returns public.app_role language sql stable security definer set search_path = public as $$ select role from public.profiles where id = auth.uid() $$;
create policy "authenticated read profiles" on public.profiles for select to authenticated using (id = auth.uid() or public.current_role() = 'administrador');
create policy "authenticated catalog" on public.products for select to authenticated using (true);
create policy "manager catalog write" on public.products for all to authenticated using (public.current_role() in ('administrador','compras')) with check (public.current_role() in ('administrador','compras'));
create policy "authenticated categories" on public.categories for select to authenticated using (true);
create policy "authenticated business data" on public.customers for all to authenticated using (true) with check (true);
create policy "authenticated suppliers" on public.suppliers for all to authenticated using (true) with check (true);
create policy "authenticated inventory" on public.stock for select to authenticated using (true);
create policy "authenticated movements" on public.inventory_movements for select to authenticated using (true);
create policy "authenticated sales" on public.sales for select to authenticated using (true);
create policy "authenticated sale items" on public.sale_items for select to authenticated using (true);
create policy "authenticated purchases" on public.purchases for select to authenticated using (true);
create policy "authenticated purchase items" on public.purchase_items for select to authenticated using (true);

create or replace function public.confirm_sale(p_sale_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare item record; current_stock numeric;
begin
  if not exists(select 1 from sales where id=p_sale_id and status <> 'anulado') then raise exception 'Venta no válida'; end if;
  for item in select si.product_id, si.quantity, s.warehouse_id from sale_items si join sales s on s.id=si.sale_id where si.sale_id=p_sale_id loop
    select quantity into current_stock from stock where product_id=item.product_id and warehouse_id=item.warehouse_id for update;
    if coalesce(current_stock,0) < item.quantity then raise exception 'Stock insuficiente para el producto %', item.product_id; end if;
    update stock set quantity=quantity-item.quantity where product_id=item.product_id and warehouse_id=item.warehouse_id;
    insert into inventory_movements(product_id,warehouse_id,user_id,movement_type,quantity,reference) values(item.product_id,item.warehouse_id,auth.uid(),'salida',item.quantity,p_sale_id::text);
  end loop;
end; $$;
