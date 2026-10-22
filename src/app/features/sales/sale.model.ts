export interface Sale {
  id: string;
  code: string;
  customer_id?: string;
  total: number;
  payment_method: string;
  status: string;
  created_at: string;
}
