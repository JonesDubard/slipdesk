-- Payment receipt screenshot URL (manual MoMo verification)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_url text;
