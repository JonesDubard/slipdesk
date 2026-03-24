-- ============================================================
-- Slipdesk — Create Client Account
-- Run this in Supabase SQL Editor after meeting the client
-- ============================================================

-- 1. Create their auth account (triggers profile creation via Supabase)
-- ⚠️  Do this part in Supabase Dashboard → Authentication → Users → Add User
--     Email:    [CLIENT_EMAIL]
--     Password: [TEMP_PASSWORD]
--     Then copy the UUID it generates and paste it below as CLIENT_UUID

-- 2. Create their company (paste the UUID from step 1)
INSERT INTO companies (id, name, billing_bypass, created_at)
VALUES (
  gen_random_uuid(),
  '[CLIENT_COMPANY_NAME]',   -- e.g. 'Acme Liberia Ltd'
  true,                       -- billing bypassed ✅
  now()
)
RETURNING id;                 -- copy this company_id for step 3

-- 3. Link their profile to the company (paste both UUIDs)
UPDATE profiles
SET 
  company_id    = '[COMPANY_ID_FROM_STEP_2]',
  billing_bypass = true
WHERE id = '[CLIENT_UUID_FROM_STEP_1]';

-- 4. Verify everything looks right
SELECT 
  p.id, p.billing_bypass,
  c.name, c.billing_bypass as company_bypass
FROM profiles p
JOIN companies c ON c.id = p.company_id
WHERE p.id = '[CLIENT_UUID_FROM_STEP_1]';