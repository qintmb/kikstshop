"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  LogIn,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Phone,
  Search,
  X,
} from "lucide-react";
import { hasSupabaseEnv, supabase } from "@/lib/supabase";
import { currency } from "@/lib/format";
import { useAuth } from "@/components/AuthProvider";
import type { StockItem } from "@/types/db";

const passthroughLoader = ({ src }: { src: string }) => src;
const WA_NUMBER = "6281144403111";

/* ── Promo Slides ─────────────────────────────── */
// Fallback/Placeholder slides if no images
const PLACEHOLDER_SLIDES = [
  {
    id: 1,
    gradient: "from-primary to-accent",
  },
  {
    id: 2,
    gradient: "from-emerald-600 to-teal-500",
  },
];

export default function StorePage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, signOut } = useAuth();

  // Slideshow
  const [promoSlides, setPromoSlides] = useState<{ id: number; url: string }[]>(
    [],
  );
  const [activeSlide, setActiveSlide] = useState(0);
  const slideTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Computed slides: use real images if available, otherwise placeholders
  const displaySlides = useMemo(() => {
    if (promoSlides.length > 0) return promoSlides;
    return PLACEHOLDER_SLIDES;
  }, [promoSlides]);

  // WhatsApp form
  const [showContactForm, setShowContactForm] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [message, setMessage] = useState("");

  /* ── Data fetching ────────────────────────────── */
  const loadItems = useCallback(async () => {
    if (!hasSupabaseEnv) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("stock_items")
      .select("id,name,price,stock,image_url,created_at")
      .neq("name", "SYSTEM_MODAL_DONOTDELETE")
      .order("created_at", { ascending: false });

    if (data) setItems(data as StockItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadItems();
    const channel = supabase
      .channel("public-store")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "stock_items",
      }, loadItems)
      .subscribe();

    // Load promo slides
    const loadPromos = async () => {
      if (!hasSupabaseEnv) return;
      // List files in 'promo' bucket
      const { data } = await supabase.storage.from("promo").list();
      if (data) {
        const slides = data
          .filter((f) =>
            f.name.startsWith("promo_") && f.name.endsWith(".webp")
          )
          .map((f) => {
            const id = parseInt(f.name.split("_")[1]);
            const { data: publicUrlData } = supabase.storage.from("promo")
              .getPublicUrl(f.name);
            return { id, url: publicUrlData.publicUrl };
          })
          .sort((a, b) => a.id - b.id);

        // Cache bust mechanism could be added here if needed, but for now simple url
        setPromoSlides(slides);
      }
    };
    loadPromos();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadItems]);

  /* ── Slideshow auto-play ──────────────────────── */
  const resetSlideTimer = useCallback(() => {
    if (slideTimer.current) clearInterval(slideTimer.current);
    slideTimer.current = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % displaySlides.length);
    }, 4000);
  }, [displaySlides.length]);

  useEffect(() => {
    resetSlideTimer();
    return () => {
      if (slideTimer.current) clearInterval(slideTimer.current);
    };
  }, [resetSlideTimer]);

  const goSlide = (dir: number) => {
    setActiveSlide((prev) =>
      (prev + dir + displaySlides.length) % displaySlides.length
    );
    resetSlideTimer();
  };

  /* ── Helpers ──────────────────────────────────── */
  const filteredItems = useMemo(
    () =>
      items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())),
    [items, search],
  );

  const handleContactClick = (itemName = "") => {
    setMessage(
      itemName
        ? `Halo, mau tanya item *_${itemName}_*. Apa masih tersedia?`
        : "Halo, saya mau tanya item di KIKSTshop.",
    );
    setShowContactForm(true);
    setMenuOpen(false);
  };

  const sendWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !message) return;
    const text = `Halo, saya *_${customerName}_*\n\n${message}`;
    window.open(
      `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`,
      "_blank",
    );
    setShowContactForm(false);
  };

  /* ── Render ───────────────────────────────────── */
  return (
    <div className="min-h-screen bg-background pb-24">
      {/* ─── Header ─────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-emerald-900 text-primary-foreground shadow-md">
        <div className="mx-auto flex h-18 max-w-5xl items-center justify-between px-4">
          {/* Logo + Name */}
          <div className="flex items-center gap-2.5">
            <Image
              src="/kikstshop_logo.webp"
              alt="Logo"
              width={28}
              height={28}
              className="brightness-0 invert"
            />
            <span className="text-lg font-bold tracking-tight">
              KIKST<span className="text-white font-light">Shop</span>
            </span>
          </div>

          {/* Desktop buttons */}
          <div className="hidden items-center gap-3 md:flex">
            <button
              onClick={() => handleContactClick()}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium transition hover:bg-white/20"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Contact
            </button>
            {user ? (
              <button
                onClick={signOut}
                className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-primary transition hover:bg-white/90"
              >
                <LogOut className="h-3.5 w-3.5" />
                Logout
              </button>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-primary transition hover:bg-white/90"
              >
                <LogIn className="h-3.5 w-3.5" />
                Login
              </Link>
            )}
          </div>

          {/* Mobile burger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="relative rounded-lg p-2 transition hover:bg-white/10 md:hidden"
          >
            <Menu
              className={`h-5 w-5 transition-transform ${
                menuOpen ? "rotate-90 opacity-0" : ""
              }`}
            />
            <X
              className={`absolute inset-0 m-auto h-5 w-5 transition-transform ${
                menuOpen ? "" : "-rotate-90 opacity-0"
              }`}
            />
          </button>
        </div>
      </header>

      {/* ─── Dropdown Menu (narrow, right-aligned) ── */}
      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30 bg-black/30"
              onClick={() => setMenuOpen(false)}
            />
            {/* Menu panel */}
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed right-4 top-[60px] z-40 w-52 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
            >
              <div className="flex flex-col py-1">
                <button
                  onClick={() => handleContactClick()}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  <MessageCircle className="h-4 w-4 text-green-600" />
                  Contact
                </button>
                <div className="mx-3 border-t border-border" />
                {user ? (
                  <button
                    onClick={() => {
                      signOut();
                      setMenuOpen(false);
                    }}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground transition hover:bg-muted w-full text-left"
                  >
                    <LogOut className="h-4 w-4 text-primary" />
                    Logout
                  </button>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    <LogIn className="h-4 w-4 text-primary" />
                    Login Admin
                  </Link>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── Main Content ───────────────────────── */}
      <main className="mx-auto max-w-5xl px-4 pt-0 sm:px-6">
        <div className="relative mb-6 -mx-4 bg-gradient-to-b
  from-emerald-900
  via-emerald-700
  to-emerald-600 px-4 pb-4 pt-5 sm:-mx-6 sm:px-6 rounded-b-3xl ">
          {/* glow effect */}
          <div className="
    absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2
    bg-emerald-400/30
    blur-3xl
    rounded-full
  " />
          {/* ── Promo Slideshow ──────────────────── */}
          <div className="relative mb-6 overflow-hidden rounded-2xl">
            <div className="relative aspect-[21/11] sm:aspect-[3/1]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSlide}
                  initial={{
                    opacity: 0,
                    scale: 1.08,
                    filter: "blur(10px)",
                    x: 60,
                  }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    filter: "blur(0px)",
                    x: 0,
                  }}
                  exit={{
                    opacity: 0,
                    scale: 0.96,
                    filter: "blur(10px)",
                    x: -60,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 80,
                    damping: 20,
                    mass: 1.2,
                  }}
                  className="absolute inset-0"
                >
                  {"url" in displaySlides[activeSlide]
                    ? (
                      <Image
                        src={(displaySlides[activeSlide] as { url: string })
                          .url}
                        alt="Promo"
                        fill
                        className="object-cover"
                        priority
                      />
                    )
                    : (
                      <div
                        className={`absolute inset-0 bg-gradient-to-r ${
                          (displaySlides[activeSlide] as any).gradient
                        }`}
                      />
                    )}
                </motion.div>
              </AnimatePresence>
              {/* Arrows */}
              <button
                onClick={() => goSlide(-1)}
                className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/20 p-1.5 text-white backdrop-blur-sm transition hover:bg-black/40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => goSlide(1)}
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/20 p-1.5 text-white backdrop-blur-sm transition hover:bg-black/40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {/* Dots */}
            <div className="absolute bottom-4.5 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
              {displaySlides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setActiveSlide(i);
                    resetSlideTimer();
                  }}
                  className={`h-1.5 rounded-full transition-all ${
                    i === activeSlide ? "w-5 bg-white" : "w-1.5 bg-white/50"
                  }`}
                />
              ))}
            </div>
          </div>
          {/* ── Search ──────────────────────────── */}
          <div className="relative mb-6">
            <Search className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search Item"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white w-full h-12 rounded-full pl-4 pr-10 text-sm shadow-sm outline-none"
            />
          </div>
        </div>

        {/* ── Loading ─────────────────────────── */}
        {loading && (
          <div className="flex flex-col items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
            <p className="mt-3 text-xs text-muted-foreground">
              Loading stok...
            </p>
          </div>
        )}
        {/* ── Empty ──────────────────────────── */}
        {!loading && filteredItems.length === 0 && (
          <div className="flex flex-col items-center py-20 text-center">
            <div className="mb-3 rounded-full bg-muted p-3">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium">Tidak ada barang ditemukan</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {search ? "Coba kata kunci lain." : "Belum ada stok barang."}
            </p>
          </div>
        )}
        {/* ── Product Grid ────────────────────── */}
        <p className="text-lg font-bold mb-3">Product Items</p>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
          {filteredItems.map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              whileHover={{ y: -3 }}
              onClick={() => handleContactClick(item.name)}
              className="group cursor-pointer overflow-hidden rounded-xl bg-card shadow-sm transition hover:shadow-md"
            >
              {/* Image */}
              <div className="relative aspect-square overflow-hidden bg-muted">
                {item.image_url
                  ? (
                    <Image
                      loader={passthroughLoader}
                      unoptimized
                      src={item.image_url}
                      alt={item.name}
                      width={280}
                      height={280}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  )
                  : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Package className="h-8 w-8 text-muted-foreground/20" />
                    </div>
                  )}

                {/* Stock badge */}
                <span
                  className={`absolute right-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow ${
                    item.stock > 5
                      ? "bg-emerald-500"
                      : item.stock > 0
                      ? "bg-amber-500"
                      : "bg-red-500"
                  }`}
                >
                  {item.stock > 0 ? `Stok: ${item.stock}` : "Habis"}
                </span>
              </div>
              {/* Info */}
              <div className="p-2.5">
                <h3 className="line-clamp-2 min-h-[1.5rem] text-xs font-medium leading-snug text-foreground">
                  {item.name}
                </h3>
                <p className="text-sm font-bold text-primary">
                  {currency(item.price)}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </main>
      {/* ─── WhatsApp Contact Modal ─────────────── */}
      <AnimatePresence>
        {showContactForm && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowContactForm(false)}
            />
            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md overflow-hidden rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl"
            >
              <div className="flex items-center justify-between border-b p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Phone className="h-4 w-4 text-green-600" />
                  Hubungi Penjual
                </h3>
                <button
                  onClick={() => setShowContactForm(false)}
                  className="rounded-full p-1 transition hover:bg-muted"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              <form onSubmit={sendWhatsApp} className="space-y-4 p-5">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Nama Anda
                  </label>
                  <input
                    type="text"
                    className="input-base"
                    placeholder="Nama lengkap..."
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Pesan
                  </label>
                  <textarea
                    className="input-base min-h-[90px] resize-none"
                    placeholder="Tulis pesan Anda..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3 text-sm font-bold text-white transition hover:bg-[#128C7E]"
                >
                  <MessageCircle className="h-4 w-4" />
                  Kirim via WhatsApp
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
