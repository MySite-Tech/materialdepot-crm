-- Migration 006: Add allowed_branches to users table
-- Run this in Supabase Dashboard > SQL Editor

alter table users add column if not exists allowed_branches text[] default '{}';
