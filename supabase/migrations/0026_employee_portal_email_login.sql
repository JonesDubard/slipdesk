-- 1. Clean up the specific placeholder
UPDATE public.employees
SET email = ''
WHERE lower(trim(email)) = 'employee@company.lr'
   OR email IS NULL;

-- 2. Clean up ANY other duplicate emails (keep the oldest, blank out the rest)
WITH ranked AS (
  SELECT id, 
         row_number() OVER (
           PARTITION BY company_id, lower(trim(email)) 
           ORDER BY created_at ASC, id ASC
         ) as rn
  FROM public.employees
  WHERE trim(email) <> ''
)
UPDATE public.employees e
SET email = ''
FROM ranked r
WHERE e.id = r.id AND r.rn > 1;

-- 3. Enforce case-insensitive uniqueness per company, ignoring empty emails
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_company_email_ci
  ON public.employees (company_id, lower(trim(email)))
  WHERE trim(email) <> '';
