-- Add paid_at column to sales table
ALTER TABLE sales ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;

-- Update existing records where status is 'lunas' to have paid_at = sold_at
UPDATE sales SET paid_at = sold_at WHERE status = 'lunas';
