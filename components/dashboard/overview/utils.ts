'use client';

export const fmtINR = (n?: number | null) => {
  if (!n) return '₹0';
  return '₹' + Number(n).toLocaleString('en-IN');
};

export const fmtDate = (d?: string | null) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};
