'use client';

export const ROLE_OPTIONS: Array<[string, string]> = [
  ['service_mgr', 'Service Manager'],
  ['site_auditor', 'Site Auditor'],
  ['installer', 'Site Installer'],
  ['auditor_installer', 'Site Auditor + Installer'],
  ['bm', 'Business Manager'],
  ['branch_mgr', 'Branch Manager'],
  ['coe', 'Category Ops Executive'],
  ['admin', 'Admin'],
];

export const INSTALLER_TYPES: Array<[string, string]> = [
  ['flooring', 'Wooden Flooring'],
  ['wallpaper', 'Wallpaper'],
  ['wallpanel', 'Wall Panels'],
];

export const PAY_FIELDS: Array<[string, string]> = [
  ['fl_sqft', 'Flooring ₹/sqft'],
  ['wp_std_roll', 'Std WP ₹/roll'],
  ['wp_custom_sqft', 'Custom WP ₹/sqft'],
  ['wpnl_sqft', 'Wall Panels ₹/sqft'],
];
