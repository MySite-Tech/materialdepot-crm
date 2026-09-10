'use client';

export const fmtINR = (n?: number | null) => {
  if (!n) return '₹0';
  return '₹' + Number(n).toLocaleString('en-IN');
};
