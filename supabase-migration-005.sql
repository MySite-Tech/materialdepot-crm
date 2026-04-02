-- Migration 005: Composite primary key (id, client_phone) + deduplicate existing rows
-- Run this in Supabase Dashboard > SQL Editor

-- Step 1: Remove duplicate rows — keep only the latest per (id, client_phone) pair
DELETE FROM leads
WHERE ctid NOT IN (
  SELECT DISTINCT ON (id, client_phone) ctid
  FROM leads
  ORDER BY id, client_phone, created_at DESC, ctid DESC
);

-- Step 2: Drop the existing single-column primary key on id
ALTER TABLE leads DROP CONSTRAINT leads_pkey;

-- Step 3: Add the new composite primary key (id + client_phone)
ALTER TABLE leads ADD PRIMARY KEY (id, client_phone);

-- Step 4: Verify — this should return 0 rows after the migration
-- SELECT id, client_phone, COUNT(*) FROM leads GROUP BY id, client_phone HAVING COUNT(*) > 1;
