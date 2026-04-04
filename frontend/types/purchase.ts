export interface Purchase {
  id: string;
  productId?: string;
  productName: string;
  quantity: number;
  unitPurchasePrice: number;
  totalCost: number;
  supplier?: string;
  purchaseDate: string;
  currency: string;
  userId: string;
  notes?: string;
  synced?: boolean;
}
