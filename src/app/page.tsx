"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { format, parseISO, startOfDay, subDays } from "date-fns";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  TrendingUp,
  User,
  ChevronRight,
  AlertTriangle,
  Loader2,
  FileDown,
  FileSpreadsheet,
  Plus,
  Pencil,
  Check,
  Search,
  Bell,
} from "lucide-react";
import { hasSupabaseEnv, supabase } from "@/lib/supabase";
import { currency, toNumber } from "@/lib/format";
import type { DashboardMetrics, Expense, Sale, StockItem } from "@/types/db";

type TabKey = "dashboard" | "shop" | "stock" | "income" | "account";

type ChartRow = {
  day: string;
  amount: number;
};

const LOW_STOCK_THRESHOLD = 5;

const NAV_ITEMS: Array<{ key: TabKey; label: string; icon: React.ElementType }> = [
  { key: "dashboard", label: "Home", icon: LayoutDashboard },
  { key: "shop", label: "Shop", icon: ShoppingBag },
  { key: "stock", label: "Stock", icon: Package },
  { key: "income", label: "Income", icon: TrendingUp },
  { key: "account", label: "Account", icon: User },
];

const nowLocalInput = (): string => {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
};

// Animation variants
const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const fadeInUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [selectedStockId, setSelectedStockId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [buyerName, setBuyerName] = useState("");
  const [soldAt, setSoldAt] = useState(nowLocalInput());
  const [submittingSale, setSubmittingSale] = useState(false);

  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [editingStockId, setEditingStockId] = useState<number | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [addStockInput, setAddStockInput] = useState("");

  const [fromDate, setFromDate] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const loadAll = useCallback(async () => {
    if (!hasSupabaseEnv) {
      setLoading(false);
      return;
    }

    setError(null);

    const [stockRes, salesRes, expensesRes] = await Promise.all([
      supabase
        .from("stock_items")
        .select("id,name,price,stock,image_url,created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("sales")
        .select("id,sold_at,stock_item_id,item_name,unit_price,qty,total_price,buyer_name")
        .order("sold_at", { ascending: false }),
      supabase
        .from("expenses")
        .select("id,bought_at,description,total_cost")
        .order("bought_at", { ascending: false }),
    ]);

    if (stockRes.error || salesRes.error || expensesRes.error) {
      setError(stockRes.error?.message ?? salesRes.error?.message ?? expensesRes.error?.message ?? "Failed loading data");
      setLoading(false);
      return;
    }

    const parsedStock = (stockRes.data ?? []).map((item) => ({
      ...item,
      price: toNumber(item.price),
      stock: toNumber(item.stock),
    })) as StockItem[];

    const parsedSales = (salesRes.data ?? []).map((item) => ({
      ...item,
      unit_price: toNumber(item.unit_price),
      qty: toNumber(item.qty),
      total_price: toNumber(item.total_price),
    })) as Sale[];

    const parsedExpenses = (expensesRes.data ?? []).map((item) => ({
      ...item,
      total_cost: toNumber(item.total_cost),
    })) as Expense[];

    setStockItems(parsedStock);
    setSales(parsedSales);
    setExpenses(parsedExpenses);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadAll();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAll]);

  useEffect(() => {
    if (!hasSupabaseEnv) return;

    const channel = supabase
      .channel("kikstshop-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_items" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, loadAll)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadAll]);

  const metrics: DashboardMetrics = useMemo(() => {
    const totalSales = sales.length;
    const totalRevenue = sales.reduce((acc, item) => acc + item.total_price, 0);
    const totalExpenses = expenses.reduce((acc, item) => acc + item.total_cost, 0);
    return {
      totalSales,
      totalRevenue,
      totalExpenses,
      profit: totalRevenue - totalExpenses,
    };
  }, [sales, expenses]);

  const chartData = useMemo<ChartRow[]>(() => {
    const start = startOfDay(subDays(new Date(), 29));
    const dailyMap = new Map<string, number>();

    for (let i = 0; i < 30; i += 1) {
      const date = subDays(new Date(), 29 - i);
      dailyMap.set(format(date, "yyyy-MM-dd"), 0);
    }

    sales.forEach((sale) => {
      const soldDate = parseISO(sale.sold_at);
      if (soldDate < start) return;
      const key = format(soldDate, "yyyy-MM-dd");
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + sale.total_price);
    });

    return Array.from(dailyMap.entries()).map(([day, amount]) => ({
      day: format(parseISO(day), "dd/MM"),
      amount,
    }));
  }, [sales]);

  const lowStockItems = useMemo(
    () => stockItems.filter((item) => item.stock <= LOW_STOCK_THRESHOLD).sort((a, b) => a.stock - b.stock),
    [stockItems],
  );

  const effectiveSelectedStockId = selectedStockId ?? stockItems[0]?.id ?? null;

  const selectedItem = useMemo(
    () => stockItems.find((item) => item.id === effectiveSelectedStockId) ?? null,
    [stockItems, effectiveSelectedStockId],
  );

  const saleTotal = useMemo(() => {
    if (!selectedItem) return 0;
    return selectedItem.price * qty;
  }, [selectedItem, qty]);

  const filteredSales = useMemo(() => {
    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T23:59:59`);
    return sales.filter((sale) => {
      const soldDate = new Date(sale.sold_at);
      return soldDate >= start && soldDate <= end;
    });
  }, [sales, fromDate, toDate]);

  const handleSubmitSale = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!hasSupabaseEnv) {
      setError("Supabase environment variables not configured.");
      return;
    }
    if (!selectedItem) {
      setError("Pilih item terlebih dulu.");
      return;
    }
    if (qty <= 0) {
      setError("Qty harus lebih dari 0.");
      return;
    }
    if (selectedItem.stock < qty) {
      setError("Stok tidak cukup.");
      return;
    }

    setSubmittingSale(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc("create_sale", {
      p_stock_item_id: selectedItem.id,
      p_qty: qty,
      p_buyer_name: buyerName.trim() || null,
      p_sold_at: new Date(soldAt).toISOString(),
    });

    setSubmittingSale(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setQty(1);
    setBuyerName("");
    setSoldAt(nowLocalInput());
    await loadAll();
  };

  const handlePriceSave = async (id: number) => {
    const nextPrice = Number(priceInput);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      setError("Harga tidak valid.");
      return;
    }

    const { error: updateError } = await supabase.from("stock_items").update({ price: nextPrice }).eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    setEditingPriceId(null);
    setPriceInput("");
    await loadAll();
  };

  const handleAddStock = async (id: number) => {
    const extra = Number(addStockInput);
    if (!Number.isFinite(extra) || extra <= 0) {
      setError("Jumlah stok tambahan harus lebih dari 0.");
      return;
    }

    const item = stockItems.find((entry) => entry.id === id);
    if (!item) {
      setError("Item tidak ditemukan.");
      return;
    }

    const { error: updateError } = await supabase
      .from("stock_items")
      .update({ stock: item.stock + extra })
      .eq("id", id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setEditingStockId(null);
    setAddStockInput("");
    await loadAll();
  };

  const exportExcel = () => {
    const rows = filteredSales.map((item) => ({
      Tanggal: format(new Date(item.sold_at), "dd/MM/yyyy HH:mm"),
      "Nama Barang": item.item_name,
      Qty: item.qty,
      Harga: item.unit_price,
      Total: item.total_price,
      Pembeli: item.buyer_name ?? "-",
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Income");
    XLSX.writeFile(workbook, `income-${fromDate}-to-${toDate}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text(`Income Report ${fromDate} - ${toDate}`, 40, 40);

    autoTable(doc, {
      startY: 60,
      head: [["Tanggal", "Barang", "Qty", "Harga", "Total", "Pembeli"]],
      body: filteredSales.map((item) => [
        format(new Date(item.sold_at), "dd/MM/yyyy HH:mm"),
        item.item_name,
        item.qty,
        currency(item.unit_price),
        currency(item.total_price),
        item.buyer_name ?? "-",
      ]),
      styles: {
        fontSize: 9,
      },
      headStyles: {
        fillColor: [26, 77, 77],
      },
    });

    doc.save(`income-${fromDate}-to-${toDate}.pdf`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-md px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Kikstshop</p>
              <h1 className="text-lg font-semibold text-foreground">Sales Tracker</h1>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded-full bg-secondary p-2 text-secondary-foreground transition hover:bg-secondary/80">
                <Search className="h-4 w-4" />
              </button>
              <button type="button" className="rounded-full bg-secondary p-2 text-secondary-foreground transition hover:bg-secondary/80">
                <Bell className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-4 pb-24 pt-2">
        {!hasSupabaseEnv ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card p-4"
          >
            <p className="text-sm text-amber-700">
              Isi <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code> dan{" "}
              <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> di file .env.local.
            </p>
          </motion.div>
        ) : null}

        {error ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </motion.div>
        ) : null}

        {loading ? (
          <LoadingState />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {activeTab === "dashboard" ? (
                <DashboardSection metrics={metrics} chartData={chartData} lowStockItems={lowStockItems} />
              ) : null}

              {activeTab === "shop" ? (
                <ShopSection
                  stockItems={stockItems}
                  selectedStockId={effectiveSelectedStockId}
                  setSelectedStockId={setSelectedStockId}
                  selectedItem={selectedItem}
                  qty={qty}
                  setQty={setQty}
                  buyerName={buyerName}
                  setBuyerName={setBuyerName}
                  soldAt={soldAt}
                  setSoldAt={setSoldAt}
                  saleTotal={saleTotal}
                  submitting={submittingSale}
                  onSubmit={handleSubmitSale}
                />
              ) : null}

              {activeTab === "stock" ? (
                <StockSection
                  stockItems={stockItems}
                  editingPriceId={editingPriceId}
                  editingStockId={editingStockId}
                  priceInput={priceInput}
                  addStockInput={addStockInput}
                  setEditingPriceId={setEditingPriceId}
                  setEditingStockId={setEditingStockId}
                  setPriceInput={setPriceInput}
                  setAddStockInput={setAddStockInput}
                  onSavePrice={handlePriceSave}
                  onAddStock={handleAddStock}
                />
              ) : null}

              {activeTab === "income" ? (
                <IncomeSection
                  sales={filteredSales}
                  fromDate={fromDate}
                  toDate={toDate}
                  setFromDate={setFromDate}
                  setToDate={setToDate}
                  onExportPdf={exportPdf}
                  onExportExcel={exportExcel}
                />
              ) : null}

              {activeTab === "account" ? <AccountSection /> : null}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 pb-safe">
        <div className="mx-auto max-w-md px-4 pb-3">
          <div className="flex items-center justify-around rounded-2xl bg-primary p-1.5 shadow-xl shadow-primary/20">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.key;
              return (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  className={`relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 transition-all duration-200 ${
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-primary-foreground/70 hover:text-primary-foreground"
                  }`}
                >
                  <motion.div
                    animate={isActive ? { scale: 1.1 } : { scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                  </motion.div>
                  <span className="text-[10px] font-medium">{item.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute -top-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent-foreground"
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}

function LoadingState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-16"
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="mt-3 text-sm text-muted-foreground">Memuat data...</p>
    </motion.div>
  );
}

function DashboardSection({ metrics, chartData, lowStockItems }: { metrics: DashboardMetrics; chartData: ChartRow[]; lowStockItems: StockItem[] }) {
  return (
    <motion.section variants={staggerContainer} initial="initial" animate="animate" className="space-y-4">
      {/* Promo Banner */}
      <motion.div
        variants={fadeInUp}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-accent p-4"
      >
        <div className="relative z-10">
          <p className="text-xs font-medium text-primary-foreground/80">Total Profit Bulan Ini</p>
          <p className="mt-1 text-2xl font-bold text-primary-foreground">{currency(metrics.profit)}</p>
          <button className="mt-3 flex items-center gap-1 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/30">
            Lihat Detail <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
        <div className="absolute -bottom-6 -right-6 h-32 w-32 rounded-full bg-white/5" />
      </motion.div>

      {/* Metrics Grid */}
      <motion.div variants={fadeInUp} className="grid grid-cols-2 gap-3">
        <MetricCard label="Total Penjualan" value={metrics.totalSales.toLocaleString("id-ID")} />
        <MetricCard label="Pendapatan" value={currency(metrics.totalRevenue)} accent />
        <MetricCard label="Pengeluaran" value={currency(metrics.totalExpenses)} />
        <MetricCard label="Profit" value={currency(metrics.profit)} highlight={metrics.profit >= 0} />
      </motion.div>

      {/* Sales Chart */}
      <motion.div variants={fadeInUp} className="card p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">Grafik Penjualan 30 Hari</p>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1a4d4d" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#1a4d4d" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value: number | undefined) => currency(value ?? 0)}
                contentStyle={{
                  background: "#fff",
                  border: "none",
                  borderRadius: "12px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  fontSize: "12px",
                }}
              />
              <Area type="monotone" dataKey="amount" stroke="#1a4d4d" fill="url(#salesGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Low Stock Alert */}
      <motion.div variants={fadeInUp} className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <p className="text-sm font-semibold text-foreground">Stok Menipis</p>
        </div>
        {lowStockItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Semua stok masih aman.</p>
        ) : (
          <ul className="space-y-2">
            {lowStockItems.slice(0, 5).map((item) => (
              <li key={item.id} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-sm">
                <span className="font-medium text-foreground">{item.name}</span>
                <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">{item.stock}</span>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </motion.section>
  );
}

function ShopSection({
  stockItems,
  selectedStockId,
  setSelectedStockId,
  selectedItem,
  qty,
  setQty,
  buyerName,
  setBuyerName,
  soldAt,
  setSoldAt,
  saleTotal,
  submitting,
  onSubmit,
}: {
  stockItems: StockItem[];
  selectedStockId: number | null;
  setSelectedStockId: (id: number) => void;
  selectedItem: StockItem | null;
  qty: number;
  setQty: (qty: number) => void;
  buyerName: string;
  setBuyerName: (name: string) => void;
  soldAt: string;
  setSoldAt: (value: string) => void;
  saleTotal: number;
  submitting: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <motion.section variants={staggerContainer} initial="initial" animate="animate">
      <motion.div variants={fadeInUp} className="card p-4">
        <h2 className="mb-4 text-base font-semibold text-foreground">Buat Transaksi</h2>
        <form className="space-y-3" onSubmit={onSubmit}>
          <InputWrap label="Tanggal transaksi">
            <input
              type="datetime-local"
              value={soldAt}
              onChange={(event) => setSoldAt(event.target.value)}
              className="input-base"
              required
            />
          </InputWrap>

          <InputWrap label="Pilih Item">
            <select
              className="input-base"
              value={selectedStockId ?? ""}
              onChange={(event) => setSelectedStockId(Number(event.target.value))}
              required
            >
              {stockItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} (stok {item.stock})
                </option>
              ))}
            </select>
          </InputWrap>

          <div className="grid grid-cols-2 gap-3">
            <InputWrap label="Harga">
              <input value={selectedItem ? currency(selectedItem.price) : "-"} readOnly className="input-base bg-muted" />
            </InputWrap>

            <InputWrap label="Qty">
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(event) => setQty(Number(event.target.value))}
                className="input-base"
                required
              />
            </InputWrap>
          </div>

          <InputWrap label="Total Harga">
            <input value={currency(saleTotal)} readOnly className="input-base bg-muted text-lg font-semibold text-primary" />
          </InputWrap>

          <InputWrap label="Nama pembeli (opsional)">
            <input
              type="text"
              value={buyerName}
              onChange={(event) => setBuyerName(event.target.value)}
              className="input-base"
              placeholder="Nama pembeli"
            />
          </InputWrap>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary mt-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <ShoppingBag className="h-4 w-4" />
                Submit Transaksi
              </>
            )}
          </button>
        </form>
      </motion.div>
    </motion.section>
  );
}

function StockSection({
  stockItems,
  editingPriceId,
  editingStockId,
  priceInput,
  addStockInput,
  setEditingPriceId,
  setEditingStockId,
  setPriceInput,
  setAddStockInput,
  onSavePrice,
  onAddStock,
}: {
  stockItems: StockItem[];
  editingPriceId: number | null;
  editingStockId: number | null;
  priceInput: string;
  addStockInput: string;
  setEditingPriceId: (id: number | null) => void;
  setEditingStockId: (id: number | null) => void;
  setPriceInput: (value: string) => void;
  setAddStockInput: (value: string) => void;
  onSavePrice: (id: number) => Promise<void>;
  onAddStock: (id: number) => Promise<void>;
}) {
  const passthroughLoader = ({ src }: { src: string }) => src;

  return (
    <motion.section variants={staggerContainer} initial="initial" animate="animate" className="space-y-3">
      <motion.div variants={fadeInUp} className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Stok Barang</h2>
        <span className="text-xs text-muted-foreground">{stockItems.length} item</span>
      </motion.div>

      <div className="grid grid-cols-2 gap-3">
        {stockItems.map((item, index) => (
          <motion.article
            key={item.id}
            variants={fadeInUp}
            transition={{ delay: index * 0.03 }}
            className="card overflow-hidden"
          >
            <div className="aspect-square overflow-hidden bg-muted">
              {item.image_url ? (
                <Image
                  loader={passthroughLoader}
                  unoptimized
                  src={item.image_url}
                  alt={item.name}
                  width={200}
                  height={200}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary to-muted">
                  <Package className="h-10 w-10 text-muted-foreground/40" />
                </div>
              )}
            </div>
            <div className="p-3">
              <h3 className="truncate text-sm font-medium text-foreground">{item.name}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{currency(item.price)}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                  item.stock <= LOW_STOCK_THRESHOLD
                    ? "bg-red-100 text-red-600"
                    : "bg-green-100 text-green-600"
                }`}>
                  Stok: {item.stock}
                </span>
              </div>

              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPriceId(item.id);
                    setEditingStockId(null);
                    setPriceInput(String(item.price));
                  }}
                  className="btn-secondary flex-1 py-1.5 text-[10px]"
                >
                  <Pencil className="h-3 w-3" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditingStockId(item.id);
                    setEditingPriceId(null);
                    setAddStockInput("1");
                  }}
                  className="btn-secondary flex-1 py-1.5 text-[10px]"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              <AnimatePresence>
                {editingPriceId === item.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 flex gap-1.5 overflow-hidden"
                  >
                    <input
                      value={priceInput}
                      onChange={(event) => setPriceInput(event.target.value)}
                      type="number"
                      min={0}
                      className="input-base flex-1 py-1.5 text-xs"
                      placeholder="Harga baru"
                    />
                    <button
                      type="button"
                      onClick={() => void onSavePrice(item.id)}
                      className="rounded-lg bg-primary p-2 text-primary-foreground"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </motion.div>
                )}

                {editingStockId === item.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 flex gap-1.5 overflow-hidden"
                  >
                    <input
                      value={addStockInput}
                      onChange={(event) => setAddStockInput(event.target.value)}
                      type="number"
                      min={1}
                      className="input-base flex-1 py-1.5 text-xs"
                      placeholder="Tambah stok"
                    />
                    <button
                      type="button"
                      onClick={() => void onAddStock(item.id)}
                      className="rounded-lg bg-primary p-2 text-primary-foreground"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.article>
        ))}
      </div>
    </motion.section>
  );
}

function IncomeSection({
  sales,
  fromDate,
  toDate,
  setFromDate,
  setToDate,
  onExportPdf,
  onExportExcel,
}: {
  sales: Sale[];
  fromDate: string;
  toDate: string;
  setFromDate: (date: string) => void;
  setToDate: (date: string) => void;
  onExportPdf: () => void;
  onExportExcel: () => void;
}) {
  return (
    <motion.section variants={staggerContainer} initial="initial" animate="animate" className="space-y-3">
      <motion.div variants={fadeInUp} className="card p-3">
        <div className="grid grid-cols-2 gap-2">
          <InputWrap label="Dari">
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="input-base py-2 text-xs" />
          </InputWrap>
          <InputWrap label="Sampai">
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="input-base py-2 text-xs" />
          </InputWrap>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={onExportPdf} className="btn-primary py-2 text-xs">
            <FileDown className="h-3.5 w-3.5" />
            PDF
          </button>
          <button type="button" onClick={onExportExcel} className="btn-secondary py-2 text-xs">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel
          </button>
        </div>
      </motion.div>

      <motion.div variants={fadeInUp} className="card overflow-hidden">
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full min-w-[500px] border-collapse text-xs">
            <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">Tanggal</th>
                <th className="px-3 py-2.5 font-medium">Barang</th>
                <th className="px-3 py-2.5 font-medium">Qty</th>
                <th className="px-3 py-2.5 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((item, index) => (
                <motion.tr
                  key={item.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.02 }}
                  className="border-t border-border"
                >
                  <td className="px-3 py-2.5 text-muted-foreground">{format(new Date(item.sold_at), "dd/MM/yy")}</td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{item.item_name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{item.qty}</td>
                  <td className="px-3 py-2.5 font-medium text-primary">{currency(item.total_price)}</td>
                </motion.tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-10 text-center text-muted-foreground">
                    Tidak ada data untuk rentang tanggal ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.section>
  );
}

function AccountSection() {
  return (
    <motion.section variants={staggerContainer} initial="initial" animate="animate" className="space-y-4">
      <motion.div variants={fadeInUp} className="card p-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
            <User className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Admin Shop</h2>
            <p className="text-xs text-muted-foreground">kikstshop@example.com</p>
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeInUp} className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Pengaturan</h3>
        <p className="text-xs text-muted-foreground">
          Halaman account disiapkan untuk fase berikutnya (auth, profil toko, dan preferensi aplikasi).
        </p>
      </motion.div>
    </motion.section>
  );
}

function MetricCard({ label, value, highlight, accent }: { label: string; value: string; highlight?: boolean; accent?: boolean }) {
  return (
    <article className={`card p-3 ${accent ? "bg-secondary" : ""}`}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-base font-semibold ${highlight ? "text-green-600" : accent ? "text-primary" : "text-foreground"}`}>
        {value}
      </p>
    </article>
  );
}

function InputWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
