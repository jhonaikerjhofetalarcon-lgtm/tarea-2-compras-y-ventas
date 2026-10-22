import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { Product } from '../products/product.model';

type ModuleKey =
  | 'Resumen'
  | 'Ventas'
  | 'Compras'
  | 'Inventario'
  | 'Productos'
  | 'Clientes'
  | 'Proveedores'
  | 'Reportes';

type SaleReceipt = {
  code: string;
  created_at: string;
  customer: string;
  payment_method: string;
  total: number;
  items: Array<{
    name: string;
    sku: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
};

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, RouterOutlet],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  readonly dataLoading = signal(false);
  readonly dataError = signal('');
  readonly customers = signal<any[]>([]);
  readonly suppliers = signal<any[]>([]);
  readonly categories = signal<any[]>([
    { name: 'Construcción' },
    { name: 'Herramientas' },
    { name: 'Pinturas' },
    { name: 'Electricidad' },
    { name: 'Gasfitería' },
    { name: 'Seguridad industrial' },
  ]);
  readonly sales = signal<any[]>([]);
  readonly saleReceipt = signal<SaleReceipt | null>(null);
  readonly purchases = signal<any[]>([]);
  readonly inventory = signal<any[]>([]);
  readonly warehouseId = signal('');
  readonly showEntityForm = signal(false);
  readonly entityType = signal<'customer' | 'supplier'>('customer');
  readonly showActionForm = signal<
    'sale' | 'purchase' | 'adjustment' | 'customer-payment' | 'supplier-payment' | null
  >(null);
  readonly adjustmentDefaults = signal({
    product_id: '',
    movement_type: 'entrada' as 'entrada' | 'salida',
  });
  constructor(private readonly supabase: SupabaseService) {
    this.supabase.client?.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        this.loggedIn.set(true);
        await this.loadProducts();
        await this.loadBusinessData();
      }
    });
  }
  readonly loggedIn = signal(false);
  readonly loginError = signal('');
  readonly userEmail = signal('');
  readonly loginPassword = signal('');
  readonly activeModule = signal<ModuleKey>('Resumen');
  readonly sidebarOpen = signal(false);
  readonly showProductForm = signal(false);
  readonly productCodeSuggestion = signal('');
  readonly saleProductId = signal('');
  readonly saleUnitPrice = computed(
    () => this.products().find((product) => product.id === this.saleProductId())?.price ?? 0,
  );
  readonly showNotifications = signal(false);
  readonly searchTerm = signal('');
  readonly selectedPeriod = signal('Este mes');
  readonly products = signal<Product[]>([
    {
      name: 'Cemento Portland Tipo I 42.5 kg',
      sku: '001',
      category: 'Construcción',
      stock: 24,
      minStock: 30,
      price: 29.9,
      status: 'Activo',
      color: '#e5b96b',
    },
    {
      name: 'Fierro corrugado 1/2" x 9 m',
      sku: '002',
      category: 'Construcción',
      stock: 86,
      minStock: 20,
      price: 38.5,
      status: 'Activo',
      color: '#71808d',
    },
    {
      name: 'Pintura látex blanco 4 L',
      sku: '003',
      category: 'Pinturas',
      stock: 12,
      minStock: 15,
      price: 67.9,
      status: 'Activo',
      color: '#f1f4f5',
    },
    {
      name: 'Taladro percutor 650 W',
      sku: '004',
      category: 'Herramientas',
      stock: 0,
      minStock: 5,
      price: 189.0,
      status: 'Agotado',
      color: '#2f373d',
    },
    {
      name: 'Tubo PVC desagüe 4" x 3 m',
      sku: '005',
      category: 'Gasfitería',
      stock: 48,
      minStock: 10,
      price: 32.0,
      status: 'Activo',
      color: '#dbe9ef',
    },
  ]);
  readonly filteredProducts = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    return this.products().filter(
      (product) =>
        !query ||
        `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(query),
    );
  });
  readonly modules: { label: ModuleKey; icon: string; badge?: string }[] = [
    { label: 'Resumen', icon: 'grid' },
    { label: 'Ventas', icon: 'cart' },
    { label: 'Compras', icon: 'bag' },
    { label: 'Inventario', icon: 'box', badge: '3' },
    { label: 'Productos', icon: 'tag' },
    { label: 'Clientes', icon: 'users' },
    { label: 'Proveedores', icon: 'truck' },
    { label: 'Reportes', icon: 'chart' },
  ];
  setModule(module: ModuleKey) {
    this.activeModule.set(module);
    this.sidebarOpen.set(false);
  }
  toggleSidebar() {
    this.sidebarOpen.update((value) => !value);
  }
  currency(value: number) {
    return `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
  }
  private stockErrorMessage(message: string) {
    return message.includes('Stock insuficiente o producto no registrado')
      ? 'Supabase todavía usa la función anterior. Ejecuta 202610150006_fix_initial_stock.sql en SQL Editor.'
      : message;
  }
  async login() {
    this.loginError.set('');
    if (!this.supabase.client) {
      this.loginError.set('Supabase no está configurado.');
      return;
    }
    const { error } = await this.supabase.client.auth.signInWithPassword({
      email: this.userEmail(),
      password: this.loginPassword(),
    });
    if (error) {
      this.loginError.set(
        error.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos.'
          : error.message,
      );
      return;
    }
    this.loggedIn.set(true);
    await this.loadProducts();
    await this.loadBusinessData();
  }
  async loadProducts() {
    if (!this.supabase.client) return;
    this.dataLoading.set(true);
    this.dataError.set('');
    const { data, error } = await this.supabase.client
      .from('products')
      .select(
        'id, sku, name, unit, sale_price, min_stock, active, categories(name), stock(quantity)',
      )
      .order('created_at', { ascending: false });
    if (error) {
      this.dataError.set(`No se pudieron cargar los productos: ${error.message}`);
      this.dataLoading.set(false);
      return;
    }
    this.products.set(
      (data ?? []).map((item: any) => {
        const quantity = (item.stock ?? []).reduce(
          (total: number, row: any) => total + Number(row.quantity ?? 0),
          0,
        );
        return {
          id: item.id,
          name: item.name,
          sku: item.sku,
          category: item.categories?.name ?? 'Sin categoría',
          stock: quantity,
          minStock: Number(item.min_stock ?? 0),
          price: Number(item.sale_price ?? 0),
          status: item.active && quantity > 0 ? 'Activo' : 'Agotado',
          color: '#d8a45e',
        };
      }),
    );
    this.dataLoading.set(false);
  }
  async loadBusinessData() {
    if (!this.supabase.client) return;
    const [customers, suppliers, sales, purchases, inventory, warehouses, categories] =
      await Promise.all([
        this.supabase.client
          .from('customers')
          .select('*')
          .order('created_at', { ascending: false }),
        this.supabase.client
          .from('suppliers')
          .select('*')
          .order('created_at', { ascending: false }),
        this.supabase.client
          .from('sales')
          .select('id, code, total, payment_method, status, created_at, customers(name)')
          .order('created_at', { ascending: false }),
        this.supabase.client
          .from('purchases')
          .select('id, code, total, status, created_at, suppliers(business_name)')
          .order('created_at', { ascending: false }),
        this.supabase.client
          .from('stock')
          .select('quantity, products(id, name, sku, min_stock), warehouses(name)')
          .order('quantity', { ascending: true }),
        this.supabase.client.from('warehouses').select('id, name').limit(1),
        this.supabase.client.from('categories').select('id, name').eq('active', true).order('name'),
      ]);
    if (customers.data) this.customers.set(customers.data);
    if (suppliers.data) this.suppliers.set(suppliers.data);
    if (sales.data) this.sales.set(sales.data);
    if (purchases.data) this.purchases.set(purchases.data);
    if (inventory.data) this.inventory.set(inventory.data);
    if (warehouses.data?.[0]) this.warehouseId.set(warehouses.data[0].id);
    if (categories.data?.length) this.categories.set(categories.data);
    await this.reconcilePendingPurchases();
  }
  private async reconcilePendingPurchases() {
    if (!this.supabase.client) return;
    const { data: pendingPurchases, error } = await this.supabase.client
      .from('purchases')
      .select('id, code, warehouse_id, purchase_items(product_id, quantity)')
      .eq('status', 'pendiente');
    if (error || !pendingPurchases?.length) return;

    const receivedIds: string[] = [];
    for (const purchase of pendingPurchases as any[]) {
      let received = true;
      for (const item of purchase.purchase_items ?? []) {
        const stockResult = await this.supabase.client.rpc('adjust_stock', {
          p_product_id: item.product_id,
          p_warehouse_id: purchase.warehouse_id,
          p_quantity: Number(item.quantity),
          p_movement_type: 'entrada',
          p_reason: `Entrada por compra ${purchase.code}`,
        });
        if (stockResult.error) {
          received = false;
          this.dataError.set(
            `No se pudo actualizar el stock de ${purchase.code}: ${this.stockErrorMessage(stockResult.error.message)}`,
          );
          break;
        }
      }
      if (!received) continue;
      const statusResult = await this.supabase.client
        .from('purchases')
        .update({ status: 'recibida' })
        .eq('id', purchase.id);
      if (!statusResult.error) receivedIds.push(purchase.id);
    }
    if (!receivedIds.length) return;
    await this.loadProducts();
    this.purchases.update((items) =>
      items.map((purchase) =>
        receivedIds.includes(purchase.id) ? { ...purchase, status: 'recibida' } : purchase,
      ),
    );
  }
  async logout() {
    await this.supabase.client?.auth.signOut();
    this.loggedIn.set(false);
    this.loginPassword.set('');
    this.activeModule.set('Resumen');
  }
  private nextProductCode() {
    const usedCodes = new Set(this.products().map((product) => product.sku.trim().toUpperCase()));
    for (let number = 1; number <= 9999; number += 1) {
      const code = String(number).padStart(3, '0');
      if (!usedCodes.has(code)) return code;
    }
    return `P-${Date.now()}`;
  }
  openProductForm() {
    this.dataError.set('');
    this.productCodeSuggestion.set(this.nextProductCode());
    this.showProductForm.set(true);
  }
  productCode(productId: string | undefined) {
    return this.products().find((product) => product.id === productId)?.sku ?? '';
  }
  async addProduct(form: {
    name: string;
    sku?: string;
    category: string;
    stock: number;
    price: number;
  }) {
    if (!form.name || !form.category || !this.supabase.client) return;
    const requestedCode = String(form.sku ?? '')
      .trim()
      .toUpperCase();
    const codeAlreadyUsed = this.products().some(
      (product) => product.sku.toUpperCase() === requestedCode,
    );
    const firstCode = requestedCode && !codeAlreadyUsed ? requestedCode : this.nextProductCode();
    const codesToTry = [...new Set([firstCode, this.nextProductCode(), `P-${Date.now()}`])];
    const category = this.categories().find((item) => item.name === form.category);
    let sku = firstCode;
    let product: { id: string } | null = null;
    let error: any = null;
    for (const candidate of codesToTry) {
      const result = await this.supabase.client
        .from('products')
        .insert({
          name: form.name.trim(),
          sku: candidate,
          category_id: category?.id ?? null,
          sale_price: Number(form.price) || 0,
          purchase_price: 0,
          min_stock: 5,
          unit: 'unidad',
          active: true,
        })
        .select('id')
        .single();
      product = result.data;
      error = result.error;
      if (!error) {
        sku = candidate;
        break;
      }
      if (error.code !== '23505') break;
    }
    if (!product || error) {
      this.dataError.set(
        error?.code === '23505'
          ? 'No se pudo generar un código disponible. Intenta guardar nuevamente.'
          : `No se pudo registrar el producto: ${error?.message ?? 'error desconocido'}`,
      );
      return;
    }
    const initialStock = Number(form.stock) || 0;
    if (initialStock > 0) {
      if (!this.warehouseId()) {
        this.dataError.set('Producto creado, pero no se encontró el almacén principal.');
        return;
      }
      const stockResult = await this.supabase.client.rpc('adjust_stock', {
        p_product_id: product.id,
        p_warehouse_id: this.warehouseId(),
        p_quantity: initialStock,
        p_movement_type: 'entrada',
        p_reason: 'Stock inicial del producto',
      });
      if (stockResult.error) {
        this.dataError.set(
          `Producto creado, pero no se pudo registrar el stock: ${this.stockErrorMessage(stockResult.error.message)}`,
        );
        return;
      }
    }
    this.showProductForm.set(false);
    await this.loadProducts();
  }
  openEntity(type: 'customer' | 'supplier') {
    this.entityType.set(type);
    this.showEntityForm.set(true);
  }
  async addCustomer(form: any) {
    if (!this.supabase.client || !form.name) return;
    const { error } = await this.supabase.client.from('customers').insert({
      name: form.name,
      document: form.document || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
    });
    if (error) {
      this.dataError.set(`No se pudo registrar el cliente: ${error.message}`);
      return;
    }
    this.showEntityForm.set(false);
    await this.loadBusinessData();
  }
  async addSupplier(form: any) {
    if (!this.supabase.client || !form.business_name || !form.ruc) return;
    const { error } = await this.supabase.client.from('suppliers').insert({
      business_name: form.business_name,
      ruc: form.ruc,
      contact_name: form.contact_name || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      payment_terms: form.payment_terms || null,
    });
    if (error) {
      this.dataError.set(`No se pudo registrar el proveedor: ${error.message}`);
      return;
    }
    this.showEntityForm.set(false);
    await this.loadBusinessData();
  }
  openAction(action: 'sale' | 'purchase' | 'adjustment' | 'customer-payment' | 'supplier-payment') {
    this.dataError.set('');
    if (action === 'sale') this.saleProductId.set('');
    this.showActionForm.set(action);
  }
  selectSaleProduct(productId: string) {
    this.saleProductId.set(productId);
  }
  openStockAdjustment(productId = '', movementType: 'entrada' | 'salida' = 'entrada') {
    this.dataError.set('');
    this.adjustmentDefaults.set({ product_id: productId, movement_type: movementType });
    this.showActionForm.set('adjustment');
  }
  async registerSale(form: any) {
    if (!this.supabase.client) return;
    const product = this.products().find(
      (item) =>
        (form.product_id && item.id === form.product_id) ||
        (!form.product_id &&
          item.sku ===
            String(form.sku ?? '')
              .trim()
              .toUpperCase()),
    );
    const customer = this.customers().find((item) => item.id === form.customer_id);
    if (!product?.id || !this.warehouseId()) {
      this.dataError.set('Selecciona un producto y verifica el almacén principal.');
      return;
    }
    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      this.dataError.set('La cantidad debe ser mayor que cero.');
      return;
    }
    const { data: saleId, error } = await this.supabase.client.rpc('register_sale', {
      p_customer_id: customer?.id ?? null,
      p_warehouse_id: this.warehouseId(),
      p_payment_method: form.payment_method || 'efectivo',
      p_items: [
        {
          product_id: product.id,
          quantity,
          unit_price: product.price,
        },
      ],
    });
    if (error) {
      this.dataError.set(`No se pudo registrar la venta: ${error.message}`);
      return;
    }
    this.saleReceipt.set({
      code: 'Venta registrada',
      created_at: new Date().toISOString(),
      customer: customer?.name ?? 'Cliente general',
      payment_method: form.payment_method || 'efectivo',
      total: quantity * product.price,
      items: [
        {
          name: product.name,
          sku: product.sku,
          quantity,
          unit_price: product.price,
          subtotal: quantity * product.price,
        },
      ],
    });
    if (saleId) {
      const { data: savedSale } = await this.supabase.client
        .from('sales')
        .select(
          'code, total, payment_method, status, created_at, customers(name), sale_items(quantity, unit_price, subtotal, products(name, sku))',
        )
        .eq('id', saleId)
        .maybeSingle();
      if (savedSale) {
        const savedCustomer: any = Array.isArray(savedSale.customers)
          ? savedSale.customers[0]
          : savedSale.customers;
        this.saleReceipt.set({
          code: savedSale.code,
          created_at: savedSale.created_at,
          customer: savedCustomer?.name ?? 'Cliente general',
          payment_method: savedSale.payment_method,
          total: Number(savedSale.total ?? 0),
          items: (savedSale.sale_items ?? []).map((item: any) => {
            const savedProduct = Array.isArray(item.products) ? item.products[0] : item.products;
            return {
              name: savedProduct?.name ?? 'Producto',
              sku: savedProduct?.sku ?? '',
              quantity: Number(item.quantity ?? 0),
              unit_price: Number(item.unit_price ?? 0),
              subtotal: Number(item.subtotal ?? 0),
            };
          }),
        });
      }
    }
    this.showActionForm.set(null);
    await this.loadProducts();
    await this.loadBusinessData();
  }
  printSaleReceipt() {
    window.print();
  }
  async createPurchase(form: any) {
    if (!this.supabase.client) return;
    const product = this.products().find(
      (item) =>
        (form.product_id && item.id === form.product_id) ||
        (!form.product_id &&
          item.sku ===
            String(form.sku ?? '')
              .trim()
              .toUpperCase()),
    );
    if (!form.supplier_id) {
      this.dataError.set('Selecciona un proveedor.');
      return;
    }
    if (!product?.id) {
      this.dataError.set('Selecciona un producto de la lista.');
      return;
    }
    if (!this.warehouseId()) {
      this.dataError.set(
        'No se encontró el almacén principal. Ejecuta la política de warehouses en Supabase y vuelve a iniciar sesión.',
      );
      return;
    }
    const quantity = Number(form.quantity);
    const cost = Number(form.cost);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      this.dataError.set('La cantidad comprada debe ser mayor que cero.');
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      this.dataError.set('El costo unitario no es válido.');
      return;
    }
    const total = quantity * cost;
    const { data: purchase, error } = await this.supabase.client
      .from('purchases')
      .insert({
        code: `OC-${Date.now().toString().slice(-8)}`,
        supplier_id: form.supplier_id,
        warehouse_id: this.warehouseId(),
        total,
        status: 'recibida',
      })
      .select('id')
      .single();
    if (error || !purchase) {
      this.dataError.set(
        `No se pudo registrar la compra: ${error?.message ?? 'error desconocido'}`,
      );
      return;
    }
    const detail = await this.supabase.client.from('purchase_items').insert({
      purchase_id: purchase.id,
      product_id: product.id,
      quantity,
      unit_cost: cost,
    });
    if (detail.error) {
      this.dataError.set(`Compra creada, pero faltó el detalle: ${detail.error.message}`);
      return;
    }
    const stockResult = await this.supabase.client.rpc('adjust_stock', {
      p_product_id: product.id,
      p_warehouse_id: this.warehouseId(),
      p_quantity: quantity,
      p_movement_type: 'entrada',
      p_reason: `Entrada por compra ${purchase.id}`,
    });
    if (stockResult.error) {
      this.dataError.set(
        `Compra registrada, pero no se pudo actualizar el stock: ${this.stockErrorMessage(stockResult.error.message)}`,
      );
      return;
    }
    this.showActionForm.set(null);
    await this.loadProducts();
    await this.loadBusinessData();
  }
  async adjustStock(form: any) {
    if (!this.supabase.client) return;
    const quantity = Number(form.quantity);
    const movementType = form.movement_type === 'salida' ? 'salida' : 'entrada';
    const product = this.products().find(
      (item) =>
        (form.product_id && item.id === form.product_id) ||
        (!form.product_id &&
          item.sku ===
            String(form.sku ?? '')
              .trim()
              .toUpperCase()),
    );
    if (!product?.id || !this.warehouseId()) {
      this.dataError.set('Selecciona un producto de la lista y verifica el almacén principal.');
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      this.dataError.set('La cantidad debe ser mayor que cero.');
      return;
    }
    const { error } = await this.supabase.client.rpc('adjust_stock', {
      p_product_id: product.id,
      p_warehouse_id: this.warehouseId(),
      p_quantity: quantity,
      p_movement_type: movementType,
      p_reason: String(form.reason ?? '').trim(),
    });
    if (error) {
      this.dataError.set(`No se pudo ajustar el stock: ${this.stockErrorMessage(error.message)}`);
      return;
    }
    this.showActionForm.set(null);
    await this.loadProducts();
    await this.loadBusinessData();
  }
}
