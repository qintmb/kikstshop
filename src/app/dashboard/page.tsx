"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { format, parseISO, startOfDay, startOfWeek, startOfMonth, startOfYear, subDays } from "date-fns";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { motion, AnimatePresence, number } from "framer-motion";
import {
  LayoutDashboard,
  ShoppingBag,
  ShoppingCart,
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
  Trash2,
  X,
  Upload,
  ImageIcon,
  Coins,
  LogOut,
  History,
  Wallet,
  ArrowDownLeft,
  Clock,
} from "lucide-react";
import { ImageCropper } from "@/components/ImageCropper";
import { generateFileName } from "@/lib/imageUtils";
import { hasSupabaseEnv, supabase } from "@/lib/supabase";
import { currency, toNumber } from "@/lib/format";
import type { DashboardMetrics, Expense, Sale, StockItem } from "@/types/db";

type TabKey = "dashboard" | "shop" | "stock" | "income" | "account";

type ChartRow = {
  day: string;
  amount: number;
};

const LOW_STOCK_THRESHOLD = 5;

const NAV_ITEMS: Array<{ key: TabKey; label: string; title: string; icon: React.ElementType }> = [
  { key: "dashboard", label: "Home", title: "Dashboard", icon: LayoutDashboard },
  { key: "shop", label: "Shop", title: "Transaksi", icon: ShoppingBag },
  { key: "stock", label: "Stock", title: "Stok", icon: Package },
  { key: "income", label: "Transaction", title: "History", icon: TrendingUp },
  { key: "account", label: "Account", title: "Akun Saya", icon: User },
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
  const [saleStatus, setSaleStatus] = useState<"lunas" | "belum_bayar">("lunas");
  const [submittingSale, setSubmittingSale] = useState(false);

  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [editingStockId, setEditingStockId] = useState<number | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [addStockInput, setAddStockInput] = useState("");

  const [fromDate, setFromDate] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Add Item Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemStock, setNewItemStock] = useState("");
  const [newItemImageBlob, setNewItemImageBlob] = useState<Blob | null>(null);
  const [newItemImagePreview, setNewItemImagePreview] = useState<string | null>(null);
  const [submittingNewItem, setSubmittingNewItem] = useState(false);

  // Expense Form States
  const [expenseDate, setExpenseDate] = useState(nowLocalInput());
  const [expenseItem, setExpenseItem] = useState("");
  const [expensePrice, setExpensePrice] = useState("");
  const [expenseQty, setExpenseQty] = useState(1);
  const [expenseOtherCost, setExpenseOtherCost] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [submittingExpense, setSubmittingExpense] = useState(false);

  // Modal Input States
  const [modalDate, setModalDate] = useState(nowLocalInput());
  const [modalAmount, setModalAmount] = useState("");
  const [submittingModal, setSubmittingModal] = useState(false);

  // Image cropper states
  const [showCropper, setShowCropper] = useState(false);
  const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null);

  // Delete mode states
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<number>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingItems, setDeletingItems] = useState(false);

  // Success popup state
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);

  // Get current tab info
  const currentTab = NAV_ITEMS.find((item) => item.key === activeTab);


  // Helper to ensure hidden system item exists for Modal entries
  const getSystemModalId = async (): Promise<number | null> => {
    if (!hasSupabaseEnv) return null;
    
    const SYSTEM_NAME = "SYSTEM_MODAL_DONOTDELETE";
    
    // Check if exists
    const { data: existing } = await supabase
      .from("stock_items")
      .select("id")
      .eq("name", SYSTEM_NAME)
      .single();
      
    if (existing) return existing.id;
    
    // Create if missing
    const { data: created, error } = await supabase
      .from("stock_items")
      .insert({
        name: SYSTEM_NAME,
        stock: 0,
        price: 0,
        image_url: null
      })
      .select("id")
      .single();
      
    if (error) {
      console.error("Failed to create system modal item:", error);
      return null;
    }
    
    return created.id;
  };

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
        .select("id,sold_at,stock_item_id,item_name,unit_price,qty,total_price,buyer_name,status")
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

    const parsedStock = (stockRes.data ?? [])
      .map((item) => ({
        ...item,
        price: toNumber(item.price),
        stock: toNumber(item.stock),
      }))
      .filter((item) => item.name !== "SYSTEM_MODAL_DONOTDELETE") as StockItem[];

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
    const piutang = sales
      .filter((s) => s.status === "belum_bayar")
      .reduce((acc, item) => acc + item.total_price, 0);
    return {
      totalSales,
      totalRevenue,
      totalExpenses,
      profit: totalRevenue - totalExpenses,
      piutang,
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

  const filteredExpenses = useMemo(() => {
    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T23:59:59`);
    return expenses.filter((expense) => {
      const boughtDate = new Date(expense.bought_at);
      return boughtDate >= start && boughtDate <= end;
    });
  }, [expenses, fromDate, toDate]);

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
      p_status: saleStatus,
    });

    setSubmittingSale(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setQty(1);
    setBuyerName("");
    setSoldAt(nowLocalInput());
    setSaleStatus("lunas");
    
    // Show success popup
    setShowSuccessPopup(true);
    setTimeout(() => setShowSuccessPopup(false), 2500);
    
    await loadAll();
  };

  const handleSubmitExpense = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!hasSupabaseEnv) {
      setError("Supabase environment variables not configured.");
      return;
    }

    const price = Number(expensePrice);
    const qtyVal = Number(expenseQty);
    const otherCost = Number(expenseOtherCost) || 0;

    if (!expenseItem.trim()) {
      setError("Item pembelian harus diisi.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError("Harga tidak valid.");
      return;
    }
    if (!Number.isFinite(qtyVal) || qtyVal <= 0) {
      setError("Qty harus lebih dari 0.");
      return;
    }

    const totalCost = price * qtyVal + otherCost;

    setSubmittingExpense(true);
    setError(null);

    const description = `${expenseItem.trim()} (Qty: ${qtyVal})${expenseNote ? ` - ${expenseNote}` : ""}`;

    const { error: insertError } = await supabase.from("expenses").insert({
      bought_at: new Date(expenseDate).toISOString(),
      description,
      total_cost: totalCost,
    });

    setSubmittingExpense(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    // Reset form
    setExpenseItem("");
    setExpensePrice("");
    setExpenseQty(1);
    setExpenseOtherCost("");
    setExpenseNote("");
    setExpenseDate(nowLocalInput());

    // Show success popup
    setShowSuccessPopup(true);
    setTimeout(() => setShowSuccessPopup(false), 2500);

    await loadAll();
  };

  const handleSubmitModal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!hasSupabaseEnv) {
      setError("Supabase environment variables not configured.");
      return;
    }

    const amount = Number(modalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Jumlah modal harus lebih dari 0.");
      return;
    }

    setSubmittingModal(true);
    setError(null);

    const modalStockId = await getSystemModalId();
    if (modalStockId === null) {
      setError("Gagal inisialisasi system item. Cek koneksi Supabase.");
      setSubmittingModal(false);
      return;
    }

    const { error: insertError } = await supabase.from("sales").insert({
      sold_at: new Date(modalDate).toISOString(),
      item_name: "Modal / Dana Awal",
      unit_price: amount,
      qty: 1,
      total_price: amount,
      status: "lunas",
      stock_item_id: modalStockId,
    });

    setSubmittingModal(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setModalAmount("");
    setModalDate(nowLocalInput());
    setShowSuccessPopup(true);
    setTimeout(() => setShowSuccessPopup(false), 2500);

    await loadAll();
  };

  const handleUpdateExpense = async (id: number, data: { description: string; total_cost: number; bought_at: string }) => {
    if (!hasSupabaseEnv) {
      setError("Supabase environment variables not configured.");
      return;
    }

    const { error: updateError } = await supabase.from("expenses").update(data).eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await loadAll();
  };

  const handleDeleteExpense = async (id: number) => {
    if (!hasSupabaseEnv) {
      setError("Supabase environment variables not configured.");
      return;
    }

    const { error: deleteError } = await supabase.from("expenses").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
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
    const nextStock = Number(addStockInput);
    if (!Number.isFinite(nextStock) || nextStock < 0) {
      setError("Jumlah stok tidak valid (minimal 0).");
      return;
    }

    const item = stockItems.find((entry) => entry.id === id);
    if (!item) {
      setError("Item tidak ditemukan.");
      return;
    }

    const { error: updateError } = await supabase
      .from("stock_items")
      .update({ stock: nextStock })
      .eq("id", id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setEditingStockId(null);
    setAddStockInput("");
    await loadAll();
  };

  // Handle image file selection for cropping
  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCropperImageSrc(reader.result as string);
      setShowCropper(true);
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    event.target.value = "";
  };

  // Handle crop completion
  const handleCropComplete = (blob: Blob) => {
    setNewItemImageBlob(blob);
    setNewItemImagePreview(URL.createObjectURL(blob));
    setShowCropper(false);
    setCropperImageSrc(null);
  };

  // Handle crop cancel
  const handleCropCancel = () => {
    setShowCropper(false);
    setCropperImageSrc(null);
  };

  // Reset add item form
  const resetAddItemForm = () => {
    setNewItemName("");
    setNewItemPrice("");
    setNewItemStock("");
    setNewItemImageBlob(null);
    if (newItemImagePreview) {
      URL.revokeObjectURL(newItemImagePreview);
    }
    setNewItemImagePreview(null);
    setShowAddDialog(false);
  };

  // Handle add new item
  const handleAddNewItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!hasSupabaseEnv) {
      setError("Supabase environment variables not configured.");
      return;
    }

    const price = Number(newItemPrice);
    const stock = Number(newItemStock);

    if (!newItemName.trim()) {
      setError("Nama barang harus diisi.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError("Harga tidak valid.");
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      setError("Stok tidak valid.");
      return;
    }

    setSubmittingNewItem(true);
    setError(null);

    let imageUrl: string | null = null;

    // Upload image if exists
    if (newItemImageBlob) {
      const fileName = generateFileName(newItemName);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("item")
        .upload(fileName, newItemImageBlob, {
          contentType: "image/webp",
          upsert: false,
        });

      if (uploadError) {
        setError(`Upload gagal: ${uploadError.message}`);
        setSubmittingNewItem(false);
        return;
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from("item")
        .getPublicUrl(uploadData.path);

      imageUrl = publicUrlData.publicUrl;
    }

    // Insert new item
    const { error: insertError } = await supabase.from("stock_items").insert({
      name: newItemName.trim(),
      price,
      stock,
      image_url: imageUrl,
    });

    setSubmittingNewItem(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    resetAddItemForm();
    await loadAll();
  };

  // Toggle item selection for delete
  const toggleDeleteSelection = (id: number) => {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Exit delete mode
  const exitDeleteMode = () => {
    setDeleteMode(false);
    setSelectedForDelete(new Set());
    setConfirmingDelete(false);
  };

  // Handle batch delete
  const handleDeleteItems = async () => {
    if (selectedForDelete.size === 0) return;

    setDeletingItems(true);
    setError(null);

    const itemsToDelete = stockItems.filter((item) => selectedForDelete.has(item.id));

    // Delete images from bucket (batch)
    const filesToDelete = itemsToDelete
      .map((item) => (item.image_url ? item.image_url.split("/").pop() : null))
      .filter((name): name is string => !!name);

    if (filesToDelete.length > 0) {
      const { error: storageError } = await supabase.storage.from("item").remove(filesToDelete);
      if (storageError) {
        console.error("Storage delete error:", storageError.message);
      }
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from("stock_items")
      .delete()
      .in("id", Array.from(selectedForDelete));

    setDeletingItems(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    exitDeleteMode();
    await loadAll();
  };


  const exportExcel = () => {
    const modalSales = filteredSales.filter((s) => s.item_name === "Modal / Dana Awal");
    const actualSales = filteredSales.filter((s) => s.item_name !== "Modal / Dana Awal");

    const totalRevenue = actualSales.reduce((a, s) => a + s.total_price, 0);
    const totalModal = modalSales.reduce((a, s) => a + s.total_price, 0);
    const totalExpense = filteredExpenses.reduce((a, e) => a + e.total_cost, 0);
    const pendapatan = totalRevenue - totalExpense;
    const now = format(new Date(), "dd/MM/yyyy HH:mm");

    // Build rows manually for structured header layout
    const wsData: (string | number | null)[][] = [
      ["LAPORAN PENGADAAN & PENJUALAN SOUVENIR"],
      ["SEKSI EKONOMI"],
      [],
      ["Dari Tanggal", `: ${fromDate}`, null, null, null, "Tanggal Cetak", `: ${now}`],
      ["Sampai Tanggal", `: ${toDate}`],
      [],
      ["Total Penjualan", `: ${actualSales.length} Transaksi`, null, null, null, "Pengeluaran", `: ${currency(totalExpense)}`],
      ["Penjualan", `: ${currency(totalRevenue)}`],
      ["Total Modal", `: ${currency(totalModal)}`, null, null, null, "Pendapatan Bersih", `: ${currency(pendapatan)}`],
      [],
      ["Tanggal", "Nama Barang", "Qty", "Harga", "Total", "Pembeli", "Status"],
    ];

    filteredSales.forEach((item) => {
      wsData.push([
        format(new Date(item.sold_at), "dd/MM/yyyy HH:mm"),
        item.item_name,
        item.qty,
        item.unit_price,
        item.total_price,
        item.buyer_name ?? "-",
        item.status === "lunas" ? "Lunas" : "Belum Bayar",
      ]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    worksheet["!cols"] = [
      { wch: 20 }, // A - Tanggal
      { wch: 28 }, // B - Nama Barang
      { wch: 6 },  // C - Qty
      { wch: 14 }, // D - Harga
      { wch: 14 }, // E - Total
      { wch: 18 }, // F - Pembeli
      { wch: 18 }, // G - Status
    ];

    // Merge title cells
    worksheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // Row 1 title
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }, // Row 2 subtitle
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan");
    XLSX.writeFile(workbook, `laporan-${fromDate}-to-${toDate}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    const modalSales = filteredSales.filter((s) => s.item_name === "Modal / Dana Awal");
    const actualSales = filteredSales.filter((s) => s.item_name !== "Modal / Dana Awal");

    const totalRevenue = actualSales.reduce((a, s) => a + s.total_price, 0);
    const totalModal = modalSales.reduce((a, s) => a + s.total_price, 0);
    const totalExpense = filteredExpenses.reduce((a, e) => a + e.total_cost, 0);
    const pendapatan = totalRevenue - totalExpense;
    const now = format(new Date(), "dd/MM/yyyy HH:mm");

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("LAPORAN PENGADAAN & PENJUALAN SOUVENIR", pageWidth / 2, 36, { align: "center" });
    doc.setFontSize(12);
    doc.text("SEKSI EKONOMI", pageWidth / 2, 52, { align: "center" });

    // Left info block
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const infoY = 76;
    doc.text(`Dari Tanggal       : ${fromDate}`, 40, infoY);
    doc.text(`Sampai Tanggal  : ${toDate}`, 40, infoY + 14);

    doc.text(`Total Penjualan  : ${actualSales.length} Transaksi`, 40, infoY + 36);
    doc.text(`Penjualan            : ${currency(totalRevenue)}`, 40, infoY + 50);
    doc.text(`Total Modal         : ${currency(totalModal)}`, 40, infoY + 64);
    doc.text(`Pendapatan Bersih: ${currency(pendapatan)}`, 40, infoY + 78);

    // Right info block
    doc.text(`Tanggal Cetak : ${now}`, pageWidth - 200, infoY);
    doc.text(`Pengeluaran    : ${currency(totalExpense)}`, pageWidth - 200, infoY + 36);

    // Table
    autoTable(doc, {
      startY: infoY + 84,
      head: [["Tanggal", "Nama Barang", "Qty", "Harga", "Total", "Pembeli", "Status"]],
      body: filteredSales.map((item) => [
        format(new Date(item.sold_at), "dd/MM/yyyy HH:mm"),
        item.item_name,
        item.qty,
        currency(item.unit_price),
        currency(item.total_price),
        item.buyer_name ?? "-",
        item.status === "lunas" ? "Lunas" : "Belum Bayar",
      ]),
      styles: {
        fontSize: 8.5,
        font: "helvetica",
        cellPadding: 4,
      },
      headStyles: {
        fillColor: [80, 80, 80],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      columnStyles: {
        0: { cellWidth: 110 },
        2: { halign: "center", cellWidth: 40 },
        3: { halign: "right", cellWidth: 80 },
        4: { halign: "right", cellWidth: 80 },
      },
    });

    doc.save(`laporan-${fromDate}-to-${toDate}.pdf`);
  };

  const recentTransactions = useMemo(() => {
    const combined = [
      ...sales.map((s) => ({ ...s, type: "sale" as const })),
      ...expenses.map((e) => ({ ...e, type: "expense" as const })),
    ];
    return combined
      .sort((a, b) => {
        const dateA = new Date(a.type === "sale" ? a.sold_at : a.bought_at).getTime();
        const dateB = new Date(b.type === "sale" ? b.sold_at : b.bought_at).getTime();
        return dateB - dateA;
      })
      .slice(0, 5);
  }, [sales, expenses]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-md px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Kikstshop</p>
              <h1 className="text-lg font-semibold text-foreground">{currentTab?.title ?? "Sales Tracker"}</h1>
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
                <DashboardSection
                  sales={sales}
                  expenses={expenses}
                  chartData={chartData}
                  recentTransactions={recentTransactions}
                  onViewDetail={() => setActiveTab("income")}
                />
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
                  saleStatus={saleStatus}
                  setSaleStatus={setSaleStatus}
                  // Expense props
                  expenseDate={expenseDate}
                  setExpenseDate={setExpenseDate}
                  expenseItem={expenseItem}
                  setExpenseItem={setExpenseItem}
                  expensePrice={expensePrice}
                  setExpensePrice={setExpensePrice}
                  expenseQty={expenseQty}
                  setExpenseQty={setExpenseQty}
                  expenseOtherCost={expenseOtherCost}
                  setExpenseOtherCost={setExpenseOtherCost}
                  expenseNote={expenseNote}
                  setExpenseNote={setExpenseNote}
                  submittingExpense={submittingExpense}
                  onSubmitExpense={handleSubmitExpense}
                  modalDate={modalDate}
                  setModalDate={setModalDate}
                  modalAmount={modalAmount}
                  setModalAmount={setModalAmount}
                  submittingModal={submittingModal}
                  onSubmitModal={handleSubmitModal}
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
                  deleteMode={deleteMode}
                  setDeleteMode={setDeleteMode}
                  selectedForDelete={selectedForDelete}
                  toggleDeleteSelection={toggleDeleteSelection}
                  onAddItem={() => setShowAddDialog(true)}
                  onConfirmDelete={() => setConfirmingDelete(true)}
                  exitDeleteMode={exitDeleteMode}
                />
              ) : null}

              {activeTab === "income" ? (
                <IncomeSection
                  sales={filteredSales}
                  expenses={filteredExpenses}
                  stockItems={stockItems}
                  fromDate={fromDate}
                  toDate={toDate}
                  setFromDate={setFromDate}
                  setToDate={setToDate}
                  onExportPdf={exportPdf}
                  onExportExcel={exportExcel}
                  onUpdateSale={async (id: number, data: { qty?: number; buyer_name?: string | null; status?: "lunas" | "belum_bayar" }) => {
                    // Recalculate total_price if qty changed
                    const updateData: Record<string, unknown> = { ...data };
                    if (data.qty !== undefined) {
                      const sale = filteredSales.find((s) => s.id === id);
                      if (sale) {
                        updateData.total_price = sale.unit_price * data.qty;
                      }
                    }
                    const { error: updateError } = await supabase
                      .from("sales")
                      .update(updateData)
                      .eq("id", id);
                    if (updateError) {
                      setError(updateError.message);
                      return;
                    }
                    await loadAll();
                  }}
                  onDeleteSale={async (id: number) => {
                    const { error: deleteError } = await supabase
                      .from("sales")
                      .delete()
                      .eq("id", id);
                    if (deleteError) {
                      setError(deleteError.message);
                      return;
                    }
                    await loadAll();
                  }}
                  onUpdateExpense={handleUpdateExpense}
                  onDeleteExpense={handleDeleteExpense}
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
          <div className="bottom-nav-glass grid grid-cols-5 items-center justify-around rounded-2xl p-1.5 shadow-xl shadow-black/20 backdrop-blur-xs">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.key;
              return (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  className="relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-primary-foreground/70 transition-colors duration-200 hover:text-primary-foreground"
                >
                  {/* Animated background fill */}
                  {isActive && (
                    <motion.div
                      layoutId="nav-bg-active"
                      className="absolute inset-0 rounded-xl bg-white/20 shadow-lg shadow-black/10"
                      transition={{
                        type: "spring",
                        stiffness: 350,
                        damping: 30,
                        mass: 0.8,
                      }}
                    />
                  )}
                  <motion.div
                    className="relative z-10"
                    animate={isActive ? { scale: 1.1, y: -1 } : { scale: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <Icon 
                      className={`h-5 w-5 transition-colors duration-200 ${isActive ? "text-white" : ""}`} 
                      strokeWidth={isActive ? 2.5 : 2} 
                    />
                  </motion.div>
                  <span className={`relative z-10 text-[10px] font-medium transition-colors duration-200 ${isActive ? "text-white" : ""}`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Add Item Dialog */}
      <AnimatePresence>
        {showAddDialog && (
          <div className="fixed inset-0 z-[9999]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={resetAddItemForm}
            />
            <div className="dialog-wrapper">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="dialog-content"
              >
                {showCropper && cropperImageSrc ? (
                  <div className="-m-6 overflow-hidden rounded-xl">
                    <ImageCropper
                      imageSrc={cropperImageSrc}
                      onCropComplete={handleCropComplete}
                      onCancel={handleCropCancel}
                    />
                  </div>
                ) : (
                  <>
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-foreground">Tambah Item Baru</h2>
                      <button
                        type="button"
                        onClick={resetAddItemForm}
                        className="rounded-full p-1.5 text-muted-foreground transition hover:bg-muted"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <form onSubmit={handleAddNewItem} className="space-y-4">
                      {/* Image Upload */}
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-foreground">Foto Produk</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageSelect}
                          className="hidden"
                          id="image-upload"
                        />
                        <label
                          htmlFor="image-upload"
                          className={`upload-area flex flex-col items-center justify-center ${newItemImagePreview ? "has-image" : ""}`}
                        >
                          {newItemImagePreview ? (
                            <div className="relative">
                              <img
                                src={newItemImagePreview}
                                alt="Preview"
                                className="h-32 w-32 rounded-lg object-cover"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition hover:opacity-100 rounded-lg">
                                <span className="text-[10px] font-bold text-white uppercase tracking-wider">Ubah Foto</span>
                              </div>
                            </div>
                          ) : (
                            <>
                              <ImageIcon className="mb-2 h-8 w-8 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">Klik untuk upload foto</span>
                              <span className="mt-1 text-xs text-muted-foreground/70">Anda bisa crop dan zoom</span>
                            </>
                          )}
                        </label>
                      </div>

                      {/* Name */}
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-foreground">Nama Barang</label>
                        <input
                          type="text"
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                          className="input-base"
                          placeholder="Contoh: Sepatu Nike Air Max"
                          required
                        />
                      </div>

                      {/* Price */}
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-foreground">Harga (Rp)</label>
                        <input
                          type="number"
                          value={newItemPrice}
                          onChange={(e) => setNewItemPrice(e.target.value)}
                          className="input-base"
                          placeholder="0"
                          min={0}
                          required
                        />
                      </div>

                      {/* Stock */}
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-foreground">Stok Awal</label>
                        <input
                          type="number"
                          value={newItemStock}
                          onChange={(e) => setNewItemStock(e.target.value)}
                          className="input-base"
                          placeholder="0"
                          min={0}
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submittingNewItem}
                        className="btn-primary mt-4"
                      >
                        {submittingNewItem ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Menyimpan...
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4" />
                            Tambah Item
                          </>
                        )}
                      </button>
                    </form>
                  </>
                )}
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <AnimatePresence>
        {confirmingDelete && (
          <div className="fixed inset-0 z-[9999]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setConfirmingDelete(false)}
            />
            <div className="dialog-wrapper">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="dialog-content max-w-sm text-center"
              >
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                  <Trash2 className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">Hapus {selectedForDelete.size} Item?</h3>
                <p className="mb-6 text-sm text-muted-foreground">
                  Item yang dihapus tidak bisa dikembalikan. Foto juga akan dihapus dari storage.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="btn-secondary flex-1"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteItems}
                    disabled={deletingItems}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
                  >
                    {deletingItems ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Menghapus...
                      </>
                    ) : (
                      "Ya, Hapus"
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Transaction Popup */}
      <AnimatePresence>
        {showSuccessPopup && (
          <div className="fixed inset-0 z-[9999] pointer-events-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="flex flex-col items-center gap-4 rounded-3xl bg-white p-8 shadow-2xl"
              >
                {/* Animated Coins */}
                <div className="relative">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 shadow-lg"
                  >
                    <Coins className="h-10 w-10 text-white" />
                  </motion.div>
                  {/* Floating coins animation */}
                  {[...Array(5)].map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 0, x: 0 }}
                      animate={{
                        opacity: [0, 1, 0],
                        y: [-10, -50],
                        x: [0, (i - 2) * 20],
                      }}
                      transition={{
                        delay: 0.2 + i * 0.1,
                        duration: 0.8,
                        ease: "easeOut",
                      }}
                      className="absolute left-1/2 top-1/2 -translate-x-1/2"
                    >
                      <Coins className="h-5 w-5 text-yellow-500" />
                    </motion.div>
                  ))}
                </div>
                <div className="text-center">
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-lg font-bold text-foreground"
                  >
                    Transaksi Berhasil!
                  </motion.p>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-sm text-muted-foreground"
                  >
                    Data penjualan tersimpan
                  </motion.p>
                </div>
              </motion.div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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

type Transaction = (Sale & { type: "sale" }) | (Expense & { type: "expense" });

type DashFilter = "all" | "weekly" | "monthly" | "yearly";
const DASH_FILTERS: { key: DashFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

function DashboardSection({
  sales,
  expenses,
  chartData,
  recentTransactions = [],
  onViewDetail,
}: {
  sales: Sale[];
  expenses: Expense[];
  chartData: ChartRow[];
  recentTransactions?: Transaction[];
  onViewDetail: () => void;
}) {
  const [dashFilter, setDashFilter] = useState<DashFilter>("all");

  const metrics: DashboardMetrics = useMemo(() => {
    const now = new Date();
    let cutoff: Date | null = null;

    if (dashFilter === "weekly") cutoff = startOfWeek(now, { weekStartsOn: 1 });
    else if (dashFilter === "monthly") cutoff = startOfMonth(now);
    else if (dashFilter === "yearly") cutoff = startOfYear(now);

    const fSales = cutoff
      ? sales.filter((s) => new Date(s.sold_at) >= cutoff!)
      : sales;
    const fExpenses = cutoff
      ? expenses.filter((e) => new Date(e.bought_at) >= cutoff!)
      : expenses;

    const totalSales = fSales.length;
    const totalRevenue = fSales.reduce((acc, item) => acc + item.total_price, 0);
    const totalExpenses = fExpenses.reduce((acc, item) => acc + item.total_cost, 0);
    const piutang = fSales
      .filter((s) => s.status === "belum_bayar")
      .reduce((acc, item) => acc + item.total_price, 0);
    return {
      totalSales,
      totalRevenue,
      totalExpenses,
      profit: totalRevenue - totalExpenses,
      piutang,
    };
  }, [sales, expenses, dashFilter]);

  return (
    <motion.section variants={staggerContainer} initial="initial" animate="animate" className="space-y-4">
      {/* Promo Banner */}
      <motion.div
        variants={fadeInUp}
        className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-accent p-4"
      >
        <div className="relative z-10">
          <p className="text-xs font-medium text-primary-foreground/80">Total Profit</p>
          <p className="mt-1 text-3xl font-bold text-primary-foreground">{currency(metrics.profit)}</p>
          <button
            onClick={onViewDetail}
            className="mt-3 flex items-center gap-1 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/30"
          >
            Lihat Detail <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
        <div className="absolute -bottom-6 -right-6 h-32 w-32 rounded-full bg-white/5" />
      </motion.div>

      {/* Time Filter Buttons */}
      <motion.div variants={fadeInUp} className="flex gap-1.5">
        {DASH_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setDashFilter(f.key)}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold tracking-wide uppercase transition-all duration-200 backdrop-blur-sm ${
              dashFilter === f.key
                ? "border-gray-700 bg-gray-800/90 text-white shadow-lg shadow-gray-900/20"
                : "border-gray-300 bg-gray-100/60 text-gray-600 hover:bg-gray-200/80"
            }`}
          >
            {f.label}
          </button>
        ))}
      </motion.div>

      {/* Metrics Grid */}
      <motion.div variants={fadeInUp} className="grid grid-cols-2 gap-2">
        <MetricCard label="Total Penjualan" value={metrics.totalSales.toLocaleString("id-ID")} variant="sales" icon={ShoppingCart} />
        <MetricCard label="Pendapatan" value={currency(metrics.totalRevenue)} variant="revenue" icon={Wallet} />
        <MetricCard label="Pengeluaran" value={currency(metrics.totalExpenses)} variant="expense" icon={ArrowDownLeft} />
        <MetricCard label="Piutang" value={currency(metrics.piutang)} variant="piutang" icon={Clock} highlight={metrics.piutang > 0} />
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
              <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
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

      {/* Recent Transactions */}
      <motion.div variants={fadeInUp} className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Riwayat Transaksi Terakhir</p>
        </div>
        {recentTransactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada transaksi.</p>
        ) : (
          <ul className="space-y-3">
            {recentTransactions.map((transaction) => {
              const isSale = transaction.type === "sale";
              return (
                <li key={`${transaction.type}-${transaction.id}`} className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        isSale ? "bg-secondary text-primary" : "bg-red-100 text-red-600"
                      }`}
                    >
                      {isSale ? <ShoppingBag className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {isSale ? transaction.item_name : transaction.description}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span>
                          {format(new Date(isSale ? transaction.sold_at : transaction.bought_at), "dd MMM, HH:mm")}
                        </span>
                        {isSale && transaction.buyer_name && (
                          <>
                            <span>•</span>
                            <span>{transaction.buyer_name}</span>
                          </>
                        )}
                        {isSale && (
                          <>
                            <span>•</span>
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase ${
                                transaction.status === "lunas"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-orange-100 text-orange-700"
                              }`}
                            >
                              {transaction.status === "lunas" ? "Lunas" : "Belum Bayar"}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      isSale ? "text-foreground" : "text-red-600"
                    }`}
                  >
                    {isSale ? "+ " : "- "}
                    {currency(isSale ? transaction.total_price : transaction.total_cost)}
                  </span>
                </li>
              );
            })}
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
  saleStatus,
  setSaleStatus,
  // Expense props
  expenseDate,
  setExpenseDate,
  expenseItem,
  setExpenseItem,
  expensePrice,
  setExpensePrice,
  expenseQty,
  setExpenseQty,
  expenseOtherCost,
  setExpenseOtherCost,
  expenseNote,
  setExpenseNote,
  submittingExpense,
  onSubmitExpense,
  // Modal props
  modalDate,
  setModalDate,
  modalAmount,
  setModalAmount,
  submittingModal,
  onSubmitModal,
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
  saleStatus: "lunas" | "belum_bayar";
  setSaleStatus: (status: "lunas" | "belum_bayar") => void;
  // Expense props
  expenseDate: string;
  setExpenseDate: (value: string) => void;
  expenseItem: string;
  setExpenseItem: (value: string) => void;
  expensePrice: string;
  setExpensePrice: (value: string) => void;
  expenseQty: number;
  setExpenseQty: (value: number) => void;
  expenseOtherCost: string;
  setExpenseOtherCost: (value: string) => void;
  expenseNote: string;
  setExpenseNote: (value: string) => void;
  submittingExpense: boolean;
  onSubmitExpense: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  // Modal props
  modalDate: string;
  setModalDate: (value: string) => void;
  modalAmount: string;
  setModalAmount: (value: string) => void;
  submittingModal: boolean;
  onSubmitModal: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const [activeMode, setActiveMode] = useState<"sale" | "expense">("sale");

  const expenseTotal = (Number(expensePrice) || 0) * (expenseQty || 0) + (Number(expenseOtherCost) || 0);

  return (
    <motion.section variants={staggerContainer} initial="initial" animate="animate" className="space-y-4">
      <motion.div variants={fadeInUp} className="card p-4">
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-muted p-1">
          <button
            onClick={() => setActiveMode("sale")}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
              activeMode === "sale" ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Penjualan
          </button>
          <button
            onClick={() => setActiveMode("expense")}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
              activeMode === "expense" ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Pengeluaran
          </button>
        </div>

        {activeMode === "sale" ? (
          <form className="space-y-3" onSubmit={onSubmit}>
            <InputWrap label="Tanggal Transaksi">
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

            <InputWrap label="Status Pembayaran">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSaleStatus("lunas")}
                  className={`flex-1 rounded-lg py-2.5 text-xs font-semibold transition-all ${
                    saleStatus === "lunas"
                      ? "bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-500/30"
                      : "bg-muted text-muted-foreground hover:bg-emerald-50"
                  }`}
                >
                  ✓ Lunas
                </button>
                <button
                  type="button"
                  onClick={() => setSaleStatus("belum_bayar")}
                  className={`flex-1 rounded-lg py-2.5 text-xs font-semibold transition-all ${
                    saleStatus === "belum_bayar"
                      ? "bg-orange-500 text-white shadow-sm ring-2 ring-orange-500/30"
                      : "bg-muted text-muted-foreground hover:bg-orange-50"
                  }`}
                >
                  Belum Bayar
                </button>
              </div>
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
        ) : (
          <form className="space-y-3" onSubmit={onSubmitExpense}>
            <InputWrap label="Tanggal Transaksi">
              <input
                type="datetime-local"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
                className="input-base"
                required
              />
            </InputWrap>

            <InputWrap label="Item Pembelian">
              <input
                type="text"
                value={expenseItem}
                onChange={(event) => setExpenseItem(event.target.value)}
                className="input-base"
                placeholder="Deskripsi pengeluaran/pembelian"
                required
              />
            </InputWrap>

            <div className="grid grid-cols-2 gap-3">
              <InputWrap label="Harga">
                <input
                  type="number"
                  value={expensePrice}
                  onChange={(event) => setExpensePrice(event.target.value)}
                  className="input-base"
                  placeholder="0"
                  min={0}
                  required
                />
              </InputWrap>

              <InputWrap label="Qty">
                <input
                  type="number"
                  min={1}
                  value={expenseQty}
                  onChange={(event) => setExpenseQty(Number(event.target.value))}
                  className="input-base"
                  required
                />
              </InputWrap>
            </div>

            <InputWrap label="Biaya Lain (Ongkir, dll)">
              <input
                type="number"
                value={expenseOtherCost}
                onChange={(event) => setExpenseOtherCost(event.target.value)}
                className="input-base"
                placeholder="0"
                min={0}
              />
            </InputWrap>

            <InputWrap label="Total">
              <input value={currency(expenseTotal)} readOnly className="input-base bg-muted text-lg font-semibold text-red-600" />
            </InputWrap>

            <InputWrap label="Keterangan (Opsional)">
              <textarea
                value={expenseNote}
                onChange={(event) => setExpenseNote(event.target.value)}
                className="input-base h-20 resize-none"
                placeholder="Catatan tambahan..."
              />
            </InputWrap>

            <button
              type="submit"
              disabled={submittingExpense || !expenseItem || !expensePrice || Number(expensePrice) < 0}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-red-600/20 transition active:scale-[0.98] disabled:opacity-70"
            >
              {submittingExpense ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <ShoppingBag className="h-4 w-4" />
                  Submit Pengeluaran
                </>
              )}
            </button>
          </form>
        )}
      </motion.div>

      {/* Modal / Capital Input Card */}
      <motion.div variants={fadeInUp} className="card p-4 border-l-4 border-l-amber-400 bg-gradient-to-r from-amber-50/50 to-transparent">
        <div className="mb-3 flex items-center gap-2">
          <div className="rounded-lg bg-amber-100 p-1.5 text-amber-600">
            <Wallet className="h-4 w-4" />
          </div>
          <h3 className="font-semibold text-amber-900">Input Modal / Dana Awal</h3>
        </div>
        <form onSubmit={onSubmitModal} className="space-y-3">
          <InputWrap label="Tanggal">
            <input
              type="datetime-local"
              value={modalDate}
              onChange={(e) => setModalDate(e.target.value)}
              className="input-base border-amber-200 focus:border-amber-400 focus:ring-amber-400/20"
              required
            />
          </InputWrap>
          <InputWrap label="Jumlah Modal (Rp)">
            <input
              type="number"
              value={modalAmount}
              onChange={(e) => setModalAmount(e.target.value)}
              className="input-base border-amber-200 focus:border-amber-400 focus:ring-amber-400/20"
              placeholder="0"
              min={1}
              required
            />
          </InputWrap>
          <button
            type="submit"
            disabled={submittingModal}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 transition hover:bg-amber-600 active:scale-[0.98] disabled:opacity-70"
          >
            {submittingModal ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Simpan Modal
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
  deleteMode,
  setDeleteMode,
  selectedForDelete,
  toggleDeleteSelection,
  onAddItem,
  onConfirmDelete,
  exitDeleteMode,
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
  deleteMode: boolean;
  setDeleteMode: (val: boolean) => void;
  selectedForDelete: Set<number>;
  toggleDeleteSelection: (id: number) => void;
  onAddItem: () => void;
  onConfirmDelete: () => void;
  exitDeleteMode: () => void;
}) {
  const passthroughLoader = ({ src }: { src: string }) => src;

  return (
    <motion.section variants={staggerContainer} initial="initial" animate="animate" className="space-y-4">
      <motion.div variants={fadeInUp} className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Stok Barang</h2>
          <span className="text-xs text-muted-foreground">{stockItems.length} item tersimpan</span>
        </div>
        <div className="flex items-center gap-2">
          {!deleteMode ? (
            <>
              <button
                type="button"
                onClick={() => setDeleteMode(true)}
                className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onAddItem}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary/90"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={exitDeleteMode}
              className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground transition hover:bg-secondary/80"
            >
              <X className="h-3.5 w-3.5" />
              Batal
            </button>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-3">
        {stockItems.map((item, index) => {
          const isSelected = selectedForDelete.has(item.id);
          return (
            <motion.article
              key={item.id}
              variants={fadeInUp}
              transition={{ delay: index * 0.03 }}
              className={`card relative overflow-hidden transition-all duration-200 ${
                deleteMode ? "cursor-pointer" : ""
              } ${isSelected ? "ring-2 ring-red-500" : ""}`}
              onClick={() => deleteMode && toggleDeleteSelection(item.id)}
            >
              {deleteMode && (
                <div className={`delete-checkbox ${isSelected ? "checked" : ""}`}>
                  {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={4} />}
                </div>
              )}

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
                {deleteMode && <div className="delete-overlay" />}
              </div>
              <div className="p-3">
                <h3 className="truncate text-sm font-medium text-foreground">{item.name}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{currency(item.price)}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                    item.stock <= LOW_STOCK_THRESHOLD
                      ? "bg-red-100 text-red-600"
                      : "bg-sky-100 text-sky-600"
                  }`}>
                    Stok: {item.stock}
                  </span>
                </div>

                {!deleteMode && (
                  <>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (editingPriceId === item.id) {
                            setEditingPriceId(null);
                            setPriceInput("");
                          } else {
                            setEditingPriceId(item.id);
                            setEditingStockId(null);
                            setPriceInput(String(item.price));
                          }
                        }}
                        className={`flex-1 py-1.5 text-[10px] transition-colors ${
                          editingPriceId === item.id
                            ? "bg-red-100 text-red-600 hover:bg-red-200"
                            : "btn-secondary"
                        }`}
                      >
                        {editingPriceId === item.id ? (
                          <X className="mx-auto h-3 w-3" />
                        ) : (
                          <Pencil className="mx-auto h-3 w-3" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (editingStockId === item.id) {
                            setEditingStockId(null);
                            setAddStockInput("");
                          } else {
                            setEditingStockId(item.id);
                            setEditingPriceId(null);
                            setAddStockInput("1");
                          }
                        }}
                        className={`flex-1 py-1.5 text-[10px] transition-colors ${
                          editingStockId === item.id
                            ? "bg-red-100 text-red-600 hover:bg-red-200"
                            : "btn-secondary"
                        }`}
                      >
                        {editingStockId === item.id ? (
                          <X className="mx-auto h-3 w-3" />
                        ) : (
                          <Plus className="mx-auto h-3 w-3" />
                        )}
                      </button>
                    </div>

                    <AnimatePresence>
                      {editingPriceId === item.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2 flex gap-1.5 overflow-hidden"
                          onClick={(e) => e.stopPropagation()}
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
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            value={addStockInput}
                            onChange={(event) => setAddStockInput(event.target.value)}
                            type="number"
                            min={0}
                            className="input-base flex-1 py-1.5 text-xs"
                            placeholder="Atur stok"
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
                  </>
                )}
              </div>
            </motion.article>
          );
        })}
      </div>

      {/* Floating Action Bar for Delete Mode */}
      <AnimatePresence>
        {deleteMode && selectedForDelete.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed inset-x-0 bottom-24 z-20 mx-auto w-full max-w-xs px-4"
          >
            <div className="flex items-center justify-between rounded-2xl bg-red-600 p-4 shadow-2xl shadow-red-900/40">
              <span className="text-sm font-semibold text-white">
                {selectedForDelete.size} item terpilih
              </span>
              <button
                type="button"
                onClick={onConfirmDelete}
                className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-bold text-red-600 transition hover:bg-white/90"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Hapus Sekarang
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function IncomeSection({
  sales,
  expenses,
  stockItems,
  fromDate,
  toDate,
  setFromDate,
  setToDate,
  onExportPdf,
  onExportExcel,
  onUpdateSale,
  onDeleteSale,
  onUpdateExpense,
  onDeleteExpense,
}: {
  sales: Sale[];
  expenses: Expense[];
  stockItems: StockItem[];
  fromDate: string;
  toDate: string;
  setFromDate: (date: string) => void;
  setToDate: (date: string) => void;
  onExportPdf: () => void;
  onExportExcel: () => void;
  onUpdateSale: (id: number, data: { qty?: number; buyer_name?: string | null; status?: "lunas" | "belum_bayar" }) => Promise<void>;
  onDeleteSale: (id: number) => Promise<void>;
  onUpdateExpense: (id: number, data: { description: string; total_cost: number; bought_at: string }) => Promise<void>;
  onDeleteExpense: (id: number) => Promise<void>;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "lunas" | "belum_bayar">("all");
  
  // Sale States
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editQty, setEditQty] = useState(0);
  const [editBuyer, setEditBuyer] = useState("");
  const [editStatus, setEditStatus] = useState<"lunas" | "belum_bayar">("lunas");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteSale, setConfirmDeleteSale] = useState(false);

  // Expense States
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [isEditingExpense, setIsEditingExpense] = useState(false);
  const [editExpenseDesc, setEditExpenseDesc] = useState("");
  const [editExpenseCost, setEditExpenseCost] = useState("");
  const [editExpenseDate, setEditExpenseDate] = useState("");
  const [confirmDeleteExpense, setConfirmDeleteExpense] = useState(false);

  const transactions = useMemo(() => {
    const combined = [
      ...sales.map((s) => ({
        type: "sale" as const,
        id: `sale-${s.id}`,
        numericId: s.id,
        date: s.sold_at,
        name: s.item_name,
        qty: s.qty,
        amount: s.total_price,
        unitPrice: s.unit_price,
        detail: s.buyer_name,
        status: s.status,
        stockItemId: s.stock_item_id,
      })),
      ...expenses.map((e) => ({
        type: "expense" as const,
        id: `expense-${e.id}`,
        numericId: e.id,
        date: e.bought_at,
        name: e.description ?? "Pengeluaran",
        qty: null as number | null,
        amount: e.total_cost,
        unitPrice: null as number | null,
        detail: null as string | null,
        status: null as string | null,
        stockItemId: null as number | null,
      })),
    ];
    return combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, expenses]);

  const filteredTransactions = useMemo(() => {
    let result = transactions;

    // Filter by status
    if (statusFilter !== "all") {
      result = result.filter((t) => t.status === statusFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.detail && t.detail.toLowerCase().includes(q))
      );
    }

    return result;
  }, [transactions, statusFilter, searchQuery]);

  const openDetail = (item: (typeof transactions)[0]) => {
    if (item.type === "sale") {
      const sale = sales.find((s) => s.id === item.numericId);
      if (!sale) return;
      setSelectedSale(sale);
      setIsEditing(false);
      setConfirmDeleteSale(false);
    } else if (item.type === "expense") {
      const expense = expenses.find((e) => e.id === item.numericId);
      if (!expense) return;
      setSelectedExpense(expense);
      setIsEditingExpense(false);
      setConfirmDeleteExpense(false);
    }
  };

  const startEditing = () => {
    if (!selectedSale) return;
    setEditQty(selectedSale.qty);
    setEditBuyer(selectedSale.buyer_name ?? "");
    setEditStatus(selectedSale.status);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!selectedSale) return;
    setSaving(true);
    await onUpdateSale(selectedSale.id, {
      qty: editQty,
      buyer_name: editBuyer.trim() || null,
      status: editStatus,
    });
    setSaving(false);
    setSelectedSale(null);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!selectedSale) return;
    if (!confirmDeleteSale) {
      setConfirmDeleteSale(true);
      return;
    }
    setDeleting(true);
    await onDeleteSale(selectedSale.id);
    setDeleting(false);
    setConfirmDeleteSale(false);
    setSelectedSale(null);
    setIsEditing(false);
  };

  const startEditingExpense = () => {
    if (!selectedExpense) return;
    setEditExpenseDesc(selectedExpense.description ?? "");
    setEditExpenseCost(String(selectedExpense.total_cost));
    const d = new Date(selectedExpense.bought_at);
    setEditExpenseDate(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    setIsEditingExpense(true);
  };

  const handleSaveExpense = async () => {
    if (!selectedExpense) return;
    setSaving(true);
    await onUpdateExpense(selectedExpense.id, {
      description: editExpenseDesc,
      total_cost: Number(editExpenseCost),
      bought_at: new Date(editExpenseDate).toISOString(),
    });
    setSaving(false);
    setSelectedExpense(null);
    setIsEditingExpense(false);
  };

  const handleDeleteExpenseClick = async () => {
    if (!selectedExpense) return;
    if (!confirmDeleteExpense) {
      setConfirmDeleteExpense(true);
      return;
    }
    setDeleting(true);
    await onDeleteExpense(selectedExpense.id);
    setDeleting(false);
    setSelectedExpense(null);
    setConfirmDeleteExpense(false);
  };

  const getItemImage = (stockItemId: number | null) => {
    if (!stockItemId) return null;
    const item = stockItems.find((si) => si.id === stockItemId);
    return item?.image_url ?? null;
  };

  const filterButtons: { key: "all" | "lunas" | "belum_bayar"; label: string }[] = [
    { key: "all", label: "Semua" },
    { key: "lunas", label: "Lunas" },
    { key: "belum_bayar", label: "Belum Bayar" },
  ];

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

        {/* Search */}
        <div className="relative mt-3">
          <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari item atau pembeli..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-base w-full py-2 pl-8 pr-3 text-xs"
          />
        </div>

        {/* Status Filter */}
        <div className="mt-2 flex gap-1.5">
          {filterButtons.map((fb) => (
            <button
              key={fb.key}
              type="button"
              onClick={() => setStatusFilter(fb.key)}
              className={`rounded-full px-3 py-1 text-[10px] font-semibold transition ${
                statusFilter === fb.key
                  ? fb.key === "lunas"
                    ? "bg-emerald-600 text-white"
                    : fb.key === "belum_bayar"
                      ? "bg-orange-500 text-white"
                      : "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {fb.label}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div variants={fadeInUp} className="card overflow-hidden">
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full border-collapse text-[10px]">
            <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">Item</th>
                <th className="px-2 py-2 font-medium text-center">Qty</th>
                <th className="px-2 py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTransactions.map((item, index) => (
                <motion.tr
                  key={item.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.02 }}
                  className="cursor-pointer transition hover:bg-muted/40"
                  onClick={() => openDetail(item)}
                >
                  <td className="px-2 py-2">
                    <div className={`font-medium ${item.name === "Modal / Dana Awal" ? "text-orange-600" : "text-foreground"}`}>{item.name}</div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span className={item.type === "expense" ? "text-red-500/70" : item.name === "Modal / Dana Awal" ? "text-orange-500/70" : ""}>
                        {format(new Date(item.date), "dd/MM HH:mm")}
                      </span>
                      {item.detail && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-0.5">
                            <User className="h-2.5 w-2.5" />
                            {item.detail}
                          </span>
                        </>
                      )}
                      {item.status && (
                        <>
                          <span>•</span>
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase ${
                              item.status === "lunas"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-orange-100 text-orange-700"
                            }`}
                          >
                            {item.status === "lunas" ? "Lunas" : "Belum Bayar"}
                          </span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center text-muted-foreground">{item.qty ?? "-"}</td>
                  <td className={`px-2 py-2 text-right font-medium ${
                    item.type === "expense" 
                      ? "text-red-600" 
                      : item.name === "Modal / Dana Awal" 
                        ? "text-orange-600" 
                        : "text-primary"
                  }`}>
                    {currency(item.amount)}
                  </td>
                </motion.tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                    Belum ada transaksi di rentang tanggal ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Transaction Detail Dialog (Sale) */}
      <AnimatePresence>
        {selectedSale && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => { setSelectedSale(null); setIsEditing(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="w-full max-w-sm overflow-hidden rounded-2xl bg-background shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Image Header */}
              <div className="relative h-40 w-full bg-muted">
                {getItemImage(selectedSale.stock_item_id) ? (
                  <Image
                    src={getItemImage(selectedSale.stock_item_id)!}
                    alt={selectedSale.item_name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageIcon className="h-12 w-12 text-muted-foreground/40" />
                  </div>
                )}
                <button
                  onClick={() => { setSelectedSale(null); setIsEditing(false); }}
                  className="absolute right-2 top-2 rounded-full bg-black/40 p-1.5 text-white transition hover:bg-black/60"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Detail Content */}
              <div className="space-y-3 p-4">
                <h3 className="text-base font-semibold text-foreground">{selectedSale.item_name}</h3>

                {!isEditing ? (
                  /* View Mode */
                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tanggal</span>
                      <span className="font-medium">{format(new Date(selectedSale.sold_at), "dd MMM yyyy, HH:mm")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Qty</span>
                      <span className="font-medium">{selectedSale.qty}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Harga Satuan</span>
                      <span className="font-medium">{currency(selectedSale.unit_price)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Harga</span>
                      <span className="font-semibold text-primary">{currency(selectedSale.total_price)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pembeli</span>
                      <span className="font-medium">{selectedSale.buyer_name || "-"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Status</span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                          selectedSale.status === "lunas"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        {selectedSale.status === "lunas" ? "Lunas" : "Belum Bayar"}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Edit Mode */
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tanggal</span>
                      <span className="font-medium">{format(new Date(selectedSale.sold_at), "dd MMM yyyy, HH:mm")}</span>
                    </div>
                    <InputWrap label="Qty">
                      <input
                        type="number"
                        min={1}
                        value={editQty}
                        onChange={(e) => setEditQty(Number(e.target.value))}
                        className="input-base w-full py-2 text-xs"
                      />
                    </InputWrap>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Harga Satuan</span>
                      <span className="font-medium">{currency(selectedSale.unit_price)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Harga</span>
                      <span className="font-semibold text-primary">{currency(selectedSale.unit_price * editQty)}</span>
                    </div>
                    <InputWrap label="Nama Pembeli">
                      <input
                        type="text"
                        value={editBuyer}
                        onChange={(e) => setEditBuyer(e.target.value)}
                        className="input-base w-full py-2 text-xs"
                        placeholder="Nama pembeli..."
                      />
                    </InputWrap>
                    <InputWrap label="Status Pembayaran">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditStatus("lunas")}
                          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                            editStatus === "lunas"
                              ? "bg-emerald-600 text-white"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          Lunas
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditStatus("belum_bayar")}
                          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                            editStatus === "belum_bayar"
                              ? "bg-orange-500 text-white"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          Belum Bayar
                        </button>
                      </div>
                    </InputWrap>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-2 pt-1">
                  {confirmDeleteSale && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl bg-red-50 p-3 text-center"
                    >
                      <p className="text-xs font-medium text-red-700">Yakin hapus transaksi ini?</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteSale(false)}
                          className="btn-secondary flex-1 py-2 text-xs"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={deleting}
                          className="flex-1 rounded-xl bg-red-500 py-2 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
                        >
                          {deleting ? "Menghapus..." : "Ya, Hapus"}
                        </button>
                      </div>
                    </motion.div>
                  )}
                  <div className="flex gap-2">
                  {!isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={startEditing}
                        className="btn-primary flex-1 py-2.5 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex aspect-square h-full items-center justify-center rounded-xl bg-red-500 text-white transition hover:bg-red-600 disabled:opacity-50"
                        style={{ minWidth: '40px' }}
                      >
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="btn-secondary flex-1 py-2.5 text-xs"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="btn-primary flex-1 py-2.5 text-xs"
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        {saving ? "Menyimpan..." : "Simpan"}
                      </button>
                    </>
                  )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expense Detail Dialog (New) */}
      <AnimatePresence>
        {selectedExpense && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => { setSelectedExpense(null); setIsEditingExpense(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="w-full max-w-sm overflow-hidden rounded-2xl bg-background shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-red-50 p-4 border-b border-red-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-red-700">
                  <ArrowDownLeft className="h-5 w-5" />
                  <h3 className="font-semibold">Detail Pengeluaran</h3>
                </div>
                <button
                  onClick={() => { setSelectedExpense(null); setIsEditingExpense(false); }}
                  className="rounded-full bg-white p-1 text-red-500 shadow-sm transition hover:bg-red-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 p-4">
                {!isEditingExpense ? (
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">Deskripsi</span>
                      <p className="font-medium text-base">{selectedExpense.description || "Pengeluaran"}</p>
                    </div>
                    <div className="flex justify-between border-t border-border pt-3">
                      <span className="text-muted-foreground">Tanggal</span>
                      <span className="font-medium">{format(new Date(selectedExpense.bought_at), "dd MMM yyyy, HH:mm")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Biaya</span>
                      <span className="font-bold text-red-600 text-lg">{currency(selectedExpense.total_cost)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <InputWrap label="Tanggal">
                      <input
                        type="datetime-local"
                        value={editExpenseDate}
                        onChange={(e) => setEditExpenseDate(e.target.value)}
                        className="input-base"
                      />
                    </InputWrap>
                    <InputWrap label="Deskripsi">
                      <input
                        type="text"
                        value={editExpenseDesc}
                        onChange={(e) => setEditExpenseDesc(e.target.value)}
                        className="input-base"
                      />
                    </InputWrap>
                    <InputWrap label="Total Biaya">
                      <input
                        type="number"
                        min={0}
                        value={editExpenseCost}
                        onChange={(e) => setEditExpenseCost(e.target.value)}
                        className="input-base"
                      />
                    </InputWrap>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2">
                  {confirmDeleteExpense && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-3 rounded-xl bg-red-50 p-3 text-center"
                    >
                      <p className="text-xs font-medium text-red-700">Hapus pengeluaran ini?</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteExpense(false)}
                          className="btn-secondary flex-1 py-1.5 text-xs"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteExpenseClick}
                          disabled={deleting}
                          className="flex-1 rounded-xl bg-red-500 py-1.5 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
                        >
                          {deleting ? "..." : "Ya, Hapus"}
                        </button>
                      </div>
                    </motion.div>
                  )}

                  <div className="flex gap-2">
                    {!isEditingExpense ? (
                      <>
                        <button
                          type="button"
                          onClick={startEditingExpense}
                          className="btn-secondary flex-1 py-2.5 text-xs bg-muted hover:bg-muted/80"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteExpenseClick}
                          disabled={deleting}
                          className="flex aspect-square h-full items-center justify-center rounded-xl border border-red-200 text-red-500 transition hover:bg-red-50 disabled:opacity-50"
                          style={{ minWidth: '40px' }}
                        >
                          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setIsEditingExpense(false)}
                          className="btn-secondary flex-1 py-2.5 text-xs"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveExpense}
                          disabled={saving}
                          className="btn-primary flex-1 py-2.5 text-xs"
                        >
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Simpan
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

import { useRouter } from "next/navigation";

function AccountSection() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  };


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

      <motion.div variants={fadeInUp} className="card p-1">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full items-center justify-center gap-2 rounded-lg p-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
        >
          {loggingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          {loggingOut ? "Keluar..." : "Keluar"}
        </button>
      </motion.div>
    </motion.section>
  );
}

function MetricCard({
  label,
  value,
  highlight,
  variant = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  variant?: "sales" | "revenue" | "expense" | "piutang" | "default";
  icon?: React.ElementType;
}) {
  const gradients: Record<string, string> = {
    sales: "from-teal-500 to-teal-700",
    revenue: "from-emerald-500 to-emerald-700",
    expense: "from-rose-400 to-rose-600",
    piutang: "from-amber-400 to-amber-600",
    default: "from-gray-400 to-gray-600",
  };

  return (
    <article className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${gradients[variant]} p-3.5 shadow-lg transition-transform hover:scale-[1.02]`}>
      {/* Decorative circles */}
      <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-white/10" />
      <div className="absolute -bottom-4 -right-4 h-20 w-20 rounded-full bg-white/5" />

      <div className="relative z-10">
        <div className="flex items-center gap-2">
          {Icon && (
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
              <Icon className="h-3.5 w-3.5 text-white" />
            </div>
          )}
          <p className="text-[10px] font-medium uppercase tracking-wide text-white/80">{label}</p>
        </div>
        <p className="mt-1.5 text-lg font-bold text-white">
          {value}
        </p>
      </div>
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
