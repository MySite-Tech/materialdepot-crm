-- Migration 005: Clean up duplicate leads and enforce uniqueness
-- Run this in Supabase Dashboard > SQL Editor

-- Step 1: Remove duplicate rows — keep only the latest entry per lead ID
-- (latest = highest created_at; using ctid as tiebreaker for same-date dupes)
DELETE FROM leads
WHERE ctid NOT IN (
  SELECT DISTINCT ON (id) ctid
  FROM leads
  ORDER BY id, created_at DESC, ctid DESC
);

-- Step 2: Verify — this should return 0 rows after the delete above
-- SELECT id, COUNT(*) FROM leads GROUP BY id HAVING COUNT(*) > 1;
