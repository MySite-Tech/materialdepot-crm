'use client';

export const LOST_COLORS = ['#EF4444','#F97316','#EAB308','#22C55E','#3B82F6','#8B5CF6','#EC4899','#14B8A6','#F59E0B','#6366F1'];

export const STATUS_COLORS: Record<string, string> = {
  'Quote Approval Pending': '#3B82F6',
  'Request for Availability Check': '#8B5CF6',
  'Site Visit': '#A855F7',
  'Order Placed': '#EAB308',
  'Partly Placed': '#FB923C',
  'Delivered': '#22C55E',
  'Order Lost': '#EF4444',
  'Refunded': '#F97316',
};

export const DEFAULT_STATUS_COLOR = '#9CA3AF';
