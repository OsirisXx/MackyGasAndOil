-- Replace fake/test branches with the actual 4 station branches
-- Run this in Supabase SQL Editor

-- First, deactivate all existing branches
UPDATE branches SET is_active = false;

-- Delete existing branches (optional - uncomment if you want to remove them completely)
-- DELETE FROM branches;

-- Insert the 4 actual branches
INSERT INTO branches (name, address, is_active) VALUES
  ('Manolo', 'Lower Sosohon, Manolo Fortich, Bukidnon', true),
  ('Sankanan', '', true),
  ('Patulangan', '', true),
  ('Balingasag', '', true)
ON CONFLICT (name) DO UPDATE SET 
  is_active = true,
  address = EXCLUDED.address;
