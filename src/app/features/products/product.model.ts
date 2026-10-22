export interface Product {
  id?: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  minStock: number;
  price: number;
  status: 'Activo' | 'Agotado';
  color: string;
}
