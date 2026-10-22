export interface InventoryRow {
  quantity: number;
  products?: { id?: string; name: string; sku: string; min_stock: number };
  warehouses?: { id?: string; name: string };
}
