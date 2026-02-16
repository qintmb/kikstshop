export type StockItem = {
  id: number;
  name: string;
  price: number;
  stock: number;
  image_url: string | null;
  created_at: string;
};

export type Sale = {
  id: number;
  sold_at: string;
  stock_item_id: number | null;
  item_name: string;
  unit_price: number;
  qty: number;
  total_price: number;
  buyer_name: string | null;
  status: "lunas" | "belum_bayar";
};

export type Expense = {
  id: number;
  bought_at: string;
  description: string | null;
  total_cost: number;
};

export type DashboardMetrics = {
  totalSales: number;
  totalRevenue: number;
  totalExpenses: number;
  profit: number;
  piutang: number;
};
