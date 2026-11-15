-- Creates one account per workshop role (roles_accounts.txt), all with the same password.
-- Change the password on the line marked CHANGE ME, then run it on the server's database.
-- The password is hashed with bcrypt here, like the backend's BCryptPasswordEncoder does.
-- Running it twice is safe: emails that already exist are skipped.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Only if the insert fails with "violates check constraint users_role_check":
-- the users table was created before these roles existed. Drop the old constraint once:
-- ALTER TABLE users DROP CONSTRAINT users_role_check;

WITH pw AS (SELECT '123456789' AS p)   -- CHANGE ME
INSERT INTO users (id, name, email, password, role)
SELECT gen_random_uuid()::text, v.name, v.email, crypt(pw.p, gen_salt('bf', 10)), v.role
FROM pw, (VALUES
    ('Sales',          'sales@phova.com',          'SALES'),
    ('Business Ops',   'business_ops@phova.com',   'BUSINESS_OPS'),
    ('Contract Admin', 'contract_admin@phova.com', 'CONTRACT_ADMIN'),
    ('Project Lead',   'project_lead@phova.com',   'PROJECT_LEAD'),
    ('Workshop Lead',  'workshop_lead@phova.com',  'WORKSHOP_LEAD'),
    ('HSE',            'hse@phova.com',            'HSE'),
    ('Storekeeper',    'storekeeper@phova.com',    'STOREKEEPER'),
    ('Quality',        'quality@phova.com',        'QUALITY'),
    ('Billing',        'billing@phova.com',        'BILLING')
) AS v(name, email, role)
ON CONFLICT (email) DO NOTHING;

-- check
SELECT email, role FROM users WHERE email LIKE '%@phova.com' ORDER BY role;
