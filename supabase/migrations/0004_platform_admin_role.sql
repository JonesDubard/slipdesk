-- Promote your platform operator account (run once in Supabase SQL Editor).
-- Matches SLIPDESK_ADMIN_EMAIL in .env.local
UPDATE public.profiles
SET role = 'admin'
WHERE lower(email) = lower('helloslipdesk@gmail.com');

-- Verify:
-- SELECT id, email, role, company_name FROM public.profiles WHERE lower(email) = 'helloslipdesk@gmail.com';
