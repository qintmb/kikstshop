# Kikstshop Personal Sales App

Web app personal untuk pencatatan penjualan barang dengan stack:

- Frontend: Next.js App Router + TypeScript
- Backend: Supabase
- Database inti: `stock_items`, `sales`, `expenses`

## Fitur MVP

- Dashboard ringkasan real-time: total transaksi, pendapatan, pengeluaran,
  profit
- Grafik penjualan 30 hari terakhir
- Shop form: input transaksi, hitung total otomatis, update stok otomatis
- Manajemen stok: edit harga dan tambah stok
- Income table: filter tanggal + export PDF/Excel
- Bottom navigation mobile-first: Dashboard, Shop, Stock Item, Income, Account

## Setup

1. Install dependency

```bash
pnpm install
```

2. Buat file env

```bash
cp .env.example .env.local
```

Isi `NEXT_PUBLIC_SUPABASE_ANON_KEY` sesuai project kamu.

3. Buat tabel dan function di Supabase

- Buka Supabase SQL Editor
- Jalankan isi file `supabase/schema.sql`

4. Jalankan app

```bash
pnpm dev
```

## Catatan

- URL project Supabase sudah diisi di `.env.example`.
- Function `create_sale` dipakai agar transaksi penjualan dan pengurangan stok
  berjalan aman di database.
- Policy RLS di `supabase/schema.sql` saat ini mode dev (`anon` terbuka). Untuk
  production, ganti policy sesuai auth role user.
