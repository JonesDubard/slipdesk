-- MoMo transaction ID submitted by customer on manual payment
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_note text;
