export interface Purchase {
  id: string;
  code: string;
  supplier_id?: string;
  total: number;
  status: string;
  created_at: string;
}
