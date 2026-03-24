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
INSERT INTO companies (id, owner_id, name, billing_bypass, created_at)
VALUES (
  gen_random_uuid(),
  '7d32a501-e9cf-4840-9fde-dd84a7679ec1',   
  'Complete Human Resources Solutions (CHRES)',   
  true,                       
  now()
)
RETURNING id;                 

-- 3. Link their profile to the company (paste both UUIDs)
UPDATE profiles
SET 
  company_id    = '4f439685-00ea-4f87-8000-7209e9cfd734',
  billing_bypass = true
WHERE id = '7d32a501-e9cf-4840-9fde-dd84a7679ec1';

-- 4. Verify everything looks right
SELECT 
  p.id, p.billing_bypass,
  c.name, c.billing_bypass as company_bypass
FROM profiles p
JOIN companies c ON c.id = p.company_id
WHERE p.id = '7d32a501-e9cf-4840-9fde-dd84a7679ec1';