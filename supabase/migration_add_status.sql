-- =====================================================
-- Migration: Add status column to sales table
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Add status column to existing sales table
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'lunas' 
CHECK (status IN ('lunas', 'belum_bayar'));

-- 2. Update create_sale function with new p_status parameter
CREATE OR REPLACE FUNCTION public.create_sale(
  p_stock_item_id bigint,
  p_qty integer,
  p_buyer_name text DEFAULT NULL,
  p_sold_at timestamptz DEFAULT now(),
  p_status text DEFAULT 'lunas'
)
RETURNS public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_row public.stock_items;
  inserted_sale public.sales;
  total numeric(14, 2);
BEGIN
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'qty harus lebih dari 0';
  END IF;

  SELECT *
  INTO item_row
  FROM public.stock_items
  WHERE id = p_stock_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item tidak ditemukan';
  END IF;

  IF item_row.stock < p_qty THEN
    RAISE EXCEPTION 'stok tidak cukup';
  END IF;

  total := item_row.price * p_qty;

  UPDATE public.stock_items
  SET stock = stock - p_qty
  WHERE id = p_stock_item_id;

  INSERT INTO public.sales (
    sold_at,
    stock_item_id,
    item_name,
    unit_price,
    qty,
    total_price,
    buyer_name,
    status
  )
  VALUES (
    p_sold_at,
    item_row.id,
    item_row.name,
    item_row.price,
    p_qty,
    total,
    nullif(trim(p_buyer_name), ''),
    coalesce(p_status, 'lunas')
  )
  RETURNING * INTO inserted_sale;

  RETURN inserted_sale;
END;
$$;

-- 3. Update GRANT (drop old signature grant and add new)
GRANT EXECUTE ON FUNCTION public.create_sale(bigint, integer, text, timestamptz, text) TO anon, authenticated;
