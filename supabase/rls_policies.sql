-- RLS Policies for Kikstshop Storage & Tables
-- Run this AFTER schema.sql in Supabase SQL Editor

-- ==========================================
-- 1. STORAGE POLICIES (Bucket: item)
-- ==========================================

-- Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow anyone to VIEW photos in the 'item' bucket
DROP POLICY IF EXISTS "Public View Item Images" ON storage.objects;
CREATE POLICY "Public View Item Images"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'item');

-- Allow ONLY authenticated users to UPLOAD photos
DROP POLICY IF EXISTS "Allow Upload Item Images" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload Item Images" ON storage.objects;
CREATE POLICY "Auth Upload Item Images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'item');

-- Allow ONLY authenticated users to DELETE photos
DROP POLICY IF EXISTS "Allow Delete Item Images" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete Item Images" ON storage.objects;
CREATE POLICY "Auth Delete Item Images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'item');


-- ==========================================
-- 2. TABLE POLICIES (Table: stock_items)
-- ==========================================

-- Ensure RLS is enabled
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

-- Allow anyone to VIEW stock items
DROP POLICY IF EXISTS "dev_all_stock_items" ON public.stock_items;
DROP POLICY IF EXISTS "Public View Stock Items" ON public.stock_items;
CREATE POLICY "Public View Stock Items"
ON public.stock_items FOR SELECT
TO anon, authenticated
USING (true);

-- Allow ONLY authenticated users to INSERT
DROP POLICY IF EXISTS "Auth Insert Stock Items" ON public.stock_items;
CREATE POLICY "Auth Insert Stock Items"
ON public.stock_items FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow ONLY authenticated users to UPDATE
DROP POLICY IF EXISTS "Auth Update Stock Items" ON public.stock_items;
CREATE POLICY "Auth Update Stock Items"
ON public.stock_items FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow ONLY authenticated users to DELETE
DROP POLICY IF EXISTS "Auth Delete Stock Items" ON public.stock_items;
CREATE POLICY "Auth Delete Stock Items"
ON public.stock_items FOR DELETE
TO authenticated
USING (true);


-- ==========================================
-- 3. TABLE POLICIES (Table: sales)
-- ==========================================

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dev_all_sales" ON public.sales;
DROP POLICY IF EXISTS "Public View Sales" ON public.sales;
CREATE POLICY "Public View Sales"
ON public.sales FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Auth Insert Sales" ON public.sales;
CREATE POLICY "Auth Insert Sales"
ON public.sales FOR INSERT
TO authenticated
WITH CHECK (true);


-- ==========================================
-- 4. TABLE POLICIES (Table: expenses)
-- ==========================================

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dev_all_expenses" ON public.expenses;
DROP POLICY IF EXISTS "Public View Expenses" ON public.expenses;
CREATE POLICY "Public View Expenses"
ON public.expenses FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Auth Insert Expenses" ON public.expenses;
CREATE POLICY "Auth Insert Expenses"
ON public.expenses FOR INSERT
TO authenticated
WITH CHECK (true);
