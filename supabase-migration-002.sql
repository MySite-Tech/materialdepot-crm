-- Run this in Supabase Dashboard > SQL Editor
-- Adds 3 new fields: client_type, property_type, architect_involved

ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_type text default '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_type text default '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS architect_involved boolean default false;
