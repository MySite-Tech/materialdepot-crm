import { useState, useEffect, useRef } from 'react';

// ── Font injection ──────────────────────────────────────────────────────────
const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap';
document.head.appendChild(fontLink);

// ── Constants ───────────────────────────────────────────────────────────────
const SALES_PEOPLE = ['Arjun Mehta', 'Priya Sharma', 'Rahul Verma', 'Sneha Iyer', 'Karan Patel'];
const BRANCHES = ['JP Nagar', 'Whitefield', 'Yelankha', 'HQ'];

const STATUSES = [
  'Quote Approval Pending',
  'Request for Availability Check',
  'Order Placed',
  'Delivered',
  'Refunded',
  'Order Lost',
];

const STATUS_COLORS = {
  'Quote Approval Pending': '#F59E0B',
  'Request for Availability Check': '#3B82F6',
  'Order Placed': '#F97316',
  'Delivered': '#22C55E',
  'Refunded': '#EF4444',
  'Order Lost': '#9CA3AF',
};

const ORDER_LOST_REASONS = [
  'Pricing Issue',
  'Credit Issue',
  'Order Closed Already',
  'Cash/Non GST Issue',
  'Delayed Estimate',
  'Sample/Material Not Approved',
  'Enquiry Invalid',
  'Enquiry Cancelled',
];

const PIPELINE_BUCKETS = {
  Active: ['Quote Approval Pending', 'Request for Availability Check', 'Order Placed'],
  Won: ['Delivered'],
  Lost: ['Refunded', 'Order Lost'],
};

const LS_KEY = 'materialdepot_crm_v2';

// ── Helpers ─────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);

const genId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let r = '';
  for (let i = 0; i < 6; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return `MD-${r}`;
};

const fmtINR = (n) => {
  if (n == null || isNaN(n)) return '\u20B90';
  return '\u20B9' + Number(n).toLocaleString('en-IN');
};

const fmtDate = (d) => {
  if (!d) return '\u2014';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtTimestamp = (ts) => {
  const dt = new Date(ts);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' \u00B7 ' +
    dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

// ── Seed data ───────────────────────────────────────────────────────────────
const SEED_LEADS = [
  // 1-10
  { id: genId(), createdAt: '2026-03-15', assignedTo: 'Arjun Mehta', branch: 'JP Nagar', status: 'Quote Approval Pending', cartValue: 125000, cartItems: [{ name: 'Portland Cement 50kg', qty: 100, price: 1250 }], followUpDate: '2026-03-28', closureDate: '2026-04-10', remarks: [{ ts: '2026-03-15T10:30:00', author: 'Arjun Mehta', text: 'Client requested quote for bulk cement order' }] },
  { id: genId(), createdAt: '2026-03-10', assignedTo: 'Priya Sharma', branch: 'Whitefield', status: 'Request for Availability Check', cartValue: 340000, cartItems: [{ name: 'TMT Steel Bars 12mm', qty: 200, price: 1500 }, { name: 'Binding Wire', qty: 50, price: 800 }], followUpDate: '2026-03-25', closureDate: '2026-04-05', remarks: [{ ts: '2026-03-10T14:00:00', author: 'Priya Sharma', text: 'Large construction project - need availability check for steel' }] },
  { id: genId(), createdAt: '2026-03-01', assignedTo: 'Rahul Verma', branch: 'Yelankha', status: 'Order Placed', cartValue: 89000, cartItems: [{ name: 'AAC Blocks', qty: 500, price: 178 }], followUpDate: '2026-04-01', closureDate: '2026-04-08', remarks: [{ ts: '2026-03-01T09:00:00', author: 'Rahul Verma', text: 'Order confirmed, delivery scheduled for next week' }] },
  { id: genId(), createdAt: '2026-02-20', assignedTo: 'Sneha Iyer', branch: 'HQ', status: 'Delivered', cartValue: 215000, cartItems: [{ name: 'Ceramic Floor Tiles', qty: 300, price: 450 }, { name: 'Tile Adhesive 20kg', qty: 100, price: 650 }], followUpDate: '', closureDate: '2026-03-10', remarks: [{ ts: '2026-03-10T16:00:00', author: 'Sneha Iyer', text: 'Delivered and payment received' }] },
  { id: genId(), createdAt: '2026-02-15', assignedTo: 'Karan Patel', branch: 'JP Nagar', status: 'Order Lost', lostReason: 'Pricing Issue', cartValue: 78000, cartItems: [{ name: 'Plywood 18mm', qty: 40, price: 1950 }], followUpDate: '', closureDate: '', remarks: [{ ts: '2026-02-28T11:00:00', author: 'Karan Patel', text: 'Client went with a competitor on price' }] },
  { id: genId(), createdAt: '2026-03-20', assignedTo: 'Arjun Mehta', branch: 'Whitefield', status: 'Refunded', cartValue: 45000, cartItems: [{ name: 'Primer 20L', qty: 10, price: 4500 }], followUpDate: '', closureDate: '2026-03-22', remarks: [{ ts: '2026-03-22T13:30:00', author: 'Arjun Mehta', text: 'Client cancelled, full refund issued' }] },
  { id: genId(), createdAt: '2026-03-18', assignedTo: 'Rahul Verma', branch: 'JP Nagar', status: 'Quote Approval Pending', cartValue: 267000, cartItems: [{ name: 'TMT Steel Bars 16mm', qty: 150, price: 1780 }], followUpDate: '2026-03-30', closureDate: '2026-04-12', remarks: [{ ts: '2026-03-18T09:15:00', author: 'Rahul Verma', text: 'Builder needs 16mm bars for commercial project' }] },
  { id: genId(), createdAt: '2026-03-17', assignedTo: 'Sneha Iyer', branch: 'Whitefield', status: 'Order Placed', cartValue: 156000, cartItems: [{ name: 'River Sand (per ton)', qty: 30, price: 3200 }, { name: 'M-Sand (per ton)', qty: 20, price: 2400 }], followUpDate: '2026-03-29', closureDate: '2026-04-05', remarks: [{ ts: '2026-03-17T11:00:00', author: 'Sneha Iyer', text: 'Sand delivery for residential plot - Sarjapur Road' }] },
  { id: genId(), createdAt: '2026-03-16', assignedTo: 'Karan Patel', branch: 'Yelankha', status: 'Delivered', cartValue: 432000, cartItems: [{ name: 'Vitrified Floor Tiles 2x2', qty: 600, price: 520 }, { name: 'Wall Tiles 1x1.5', qty: 300, price: 380 }], followUpDate: '', closureDate: '2026-03-25', remarks: [{ ts: '2026-03-25T15:00:00', author: 'Karan Patel', text: 'Full delivery completed, client satisfied' }] },
  { id: genId(), createdAt: '2026-03-14', assignedTo: 'Arjun Mehta', branch: 'HQ', status: 'Request for Availability Check', cartValue: 89500, cartItems: [{ name: 'Waterproofing Compound 20L', qty: 25, price: 3580 }], followUpDate: '2026-03-26', closureDate: '2026-04-02', remarks: [{ ts: '2026-03-14T10:00:00', author: 'Arjun Mehta', text: 'Checking stock for Dr. Fixit brand waterproofing' }] },
  // 11-20
  { id: genId(), createdAt: '2026-03-13', assignedTo: 'Priya Sharma', branch: 'JP Nagar', status: 'Quote Approval Pending', cartValue: 198000, cartItems: [{ name: 'PPC Cement 50kg', qty: 120, price: 1150 }, { name: 'Concrete Mixer Rental', qty: 5, price: 12000 }], followUpDate: '2026-03-27', closureDate: '2026-04-08', remarks: [{ ts: '2026-03-13T14:30:00', author: 'Priya Sharma', text: 'Apartment complex project, client comparing prices' }] },
  { id: genId(), createdAt: '2026-03-12', assignedTo: 'Rahul Verma', branch: 'Whitefield', status: 'Delivered', cartValue: 73500, cartItems: [{ name: 'Electrical Conduit Pipes 25mm', qty: 500, price: 95 }, { name: 'Junction Boxes', qty: 200, price: 130 }], followUpDate: '', closureDate: '2026-03-20', remarks: [{ ts: '2026-03-20T12:00:00', author: 'Rahul Verma', text: 'Electrical supplies delivered for 3BHK renovation' }] },
  { id: genId(), createdAt: '2026-03-11', assignedTo: 'Sneha Iyer', branch: 'Yelankha', status: 'Order Lost', lostReason: 'Pricing Issue', cartValue: 510000, cartItems: [{ name: 'Structural Steel I-Beam', qty: 20, price: 25500 }], followUpDate: '', closureDate: '', remarks: [{ ts: '2026-03-18T09:30:00', author: 'Sneha Iyer', text: 'Lost to local distributor with lower delivery charges' }] },
  { id: genId(), createdAt: '2026-03-09', assignedTo: 'Karan Patel', branch: 'HQ', status: 'Order Placed', cartValue: 164000, cartItems: [{ name: 'Exterior Emulsion Paint 20L', qty: 20, price: 5200 }, { name: 'Paint Rollers & Brushes Kit', qty: 20, price: 3000 }], followUpDate: '2026-03-22', closureDate: '2026-04-01', remarks: [{ ts: '2026-03-09T16:00:00', author: 'Karan Patel', text: 'Painting contractor order for apartment complex' }] },
  { id: genId(), createdAt: '2026-03-08', assignedTo: 'Arjun Mehta', branch: 'JP Nagar', status: 'Delivered', cartValue: 287000, cartItems: [{ name: 'Granite Slab Black Galaxy', qty: 50, price: 4200 }, { name: 'Marble White Makrana', qty: 25, price: 3280 }], followUpDate: '', closureDate: '2026-03-18', remarks: [{ ts: '2026-03-18T10:30:00', author: 'Arjun Mehta', text: 'Stone delivered for kitchen countertops project' }] },
  { id: genId(), createdAt: '2026-03-07', assignedTo: 'Priya Sharma', branch: 'Whitefield', status: 'Quote Approval Pending', cartValue: 445000, cartItems: [{ name: 'Ready Mix Concrete M25', qty: 50, price: 5500 }, { name: 'Ready Mix Concrete M30', qty: 30, price: 6000 }], followUpDate: '2026-03-21', closureDate: '2026-04-01', remarks: [{ ts: '2026-03-07T08:45:00', author: 'Priya Sharma', text: 'Foundation pour for commercial building - urgent quote needed' }] },
  { id: genId(), createdAt: '2026-03-06', assignedTo: 'Rahul Verma', branch: 'Yelankha', status: 'Refunded', cartValue: 62000, cartItems: [{ name: 'GI Roofing Sheets', qty: 40, price: 1550 }], followUpDate: '', closureDate: '2026-03-15', remarks: [{ ts: '2026-03-15T14:00:00', author: 'Rahul Verma', text: 'Wrong gauge delivered, client requested full refund' }] },
  { id: genId(), createdAt: '2026-03-05', assignedTo: 'Sneha Iyer', branch: 'HQ', status: 'Request for Availability Check', cartValue: 178000, cartItems: [{ name: 'CPVC Pipes 1 inch', qty: 200, price: 450 }, { name: 'CPVC Fittings Assorted', qty: 100, price: 880 }], followUpDate: '2026-03-19', closureDate: '2026-03-28', remarks: [{ ts: '2026-03-05T11:30:00', author: 'Sneha Iyer', text: 'Plumbing contractor needs CPVC for 20-flat project' }] },
  { id: genId(), createdAt: '2026-03-04', assignedTo: 'Karan Patel', branch: 'JP Nagar', status: 'Order Placed', cartValue: 95000, cartItems: [{ name: 'Fly Ash Bricks', qty: 5000, price: 19 }], followUpDate: '2026-03-18', closureDate: '2026-03-25', remarks: [{ ts: '2026-03-04T15:00:00', author: 'Karan Patel', text: 'Bulk brick order for boundary wall construction' }] },
  { id: genId(), createdAt: '2026-03-03', assignedTo: 'Arjun Mehta', branch: 'Whitefield', status: 'Delivered', cartValue: 142000, cartItems: [{ name: 'Sanitary Ware Set (WC + Basin)', qty: 10, price: 8500 }, { name: 'CP Fittings Premium', qty: 10, price: 5700 }], followUpDate: '', closureDate: '2026-03-15', remarks: [{ ts: '2026-03-15T09:00:00', author: 'Arjun Mehta', text: 'Bathroom fittings delivered for villa project' }] },
  // 21-30
  { id: genId(), createdAt: '2026-03-02', assignedTo: 'Priya Sharma', branch: 'Yelankha', status: 'Quote Approval Pending', cartValue: 520000, cartItems: [{ name: 'Aluminium Windows 4x3', qty: 30, price: 12500 }, { name: 'Aluminium Sliding Doors', qty: 8, price: 18500 }], followUpDate: '2026-03-16', closureDate: '2026-03-30', remarks: [{ ts: '2026-03-02T10:00:00', author: 'Priya Sharma', text: 'Window and door order for new apartment block' }] },
  { id: genId(), createdAt: '2026-02-28', assignedTo: 'Rahul Verma', branch: 'HQ', status: 'Order Placed', cartValue: 234000, cartItems: [{ name: 'Gypsum Board 12mm', qty: 200, price: 650 }, { name: 'GI Channel & Track', qty: 300, price: 347 }], followUpDate: '2026-03-14', closureDate: '2026-03-22', remarks: [{ ts: '2026-02-28T13:00:00', author: 'Rahul Verma', text: 'False ceiling material for IT office fit-out' }] },
  { id: genId(), createdAt: '2026-02-27', assignedTo: 'Sneha Iyer', branch: 'JP Nagar', status: 'Order Lost', lostReason: 'Pricing Issue', cartValue: 187000, cartItems: [{ name: 'Hardwood Door Frames', qty: 15, price: 8500 }, { name: 'Flush Doors', qty: 15, price: 3967 }], followUpDate: '', closureDate: '', remarks: [{ ts: '2026-03-05T10:00:00', author: 'Sneha Iyer', text: 'Client found cheaper alternative at local timber market' }] },
  { id: genId(), createdAt: '2026-02-26', assignedTo: 'Karan Patel', branch: 'Whitefield', status: 'Delivered', cartValue: 98000, cartItems: [{ name: 'Wire Mesh 4mm', qty: 100, price: 580 }, { name: 'Binding Wire 20 gauge', qty: 100, price: 400 }], followUpDate: '', closureDate: '2026-03-08', remarks: [{ ts: '2026-03-08T11:30:00', author: 'Karan Patel', text: 'Mesh and wire delivered for slab reinforcement' }] },
  { id: genId(), createdAt: '2026-02-25', assignedTo: 'Arjun Mehta', branch: 'Yelankha', status: 'Request for Availability Check', cartValue: 367000, cartItems: [{ name: 'Solid Concrete Blocks 6 inch', qty: 2000, price: 55 }, { name: 'Solid Concrete Blocks 8 inch', qty: 2000, price: 72 }, { name: 'Portland Cement 50kg', qty: 80, price: 1250 }], followUpDate: '2026-03-10', closureDate: '2026-03-20', remarks: [{ ts: '2026-02-25T08:30:00', author: 'Arjun Mehta', text: 'Large block order for warehouse construction' }] },
  { id: genId(), createdAt: '2026-02-24', assignedTo: 'Priya Sharma', branch: 'HQ', status: 'Refunded', cartValue: 34500, cartItems: [{ name: 'Wood Primer 4L', qty: 15, price: 2300 }], followUpDate: '', closureDate: '2026-03-01', remarks: [{ ts: '2026-03-01T15:30:00', author: 'Priya Sharma', text: 'Product quality issue reported, full refund processed' }] },
  { id: genId(), createdAt: '2026-02-23', assignedTo: 'Rahul Verma', branch: 'JP Nagar', status: 'Delivered', cartValue: 456000, cartItems: [{ name: 'Kota Stone Flooring', qty: 400, price: 750 }, { name: 'Stone Adhesive 25kg', qty: 200, price: 780 }], followUpDate: '', closureDate: '2026-03-05', remarks: [{ ts: '2026-03-05T17:00:00', author: 'Rahul Verma', text: 'Stone flooring installed successfully at Jayanagar site' }] },
  { id: genId(), createdAt: '2026-02-22', assignedTo: 'Sneha Iyer', branch: 'Whitefield', status: 'Quote Approval Pending', cartValue: 289000, cartItems: [{ name: 'Solar Water Heater 300L', qty: 5, price: 35000 }, { name: 'PVC Water Tank 1000L', qty: 10, price: 11400 }], followUpDate: '2026-03-08', closureDate: '2026-03-18', remarks: [{ ts: '2026-02-22T12:00:00', author: 'Sneha Iyer', text: 'Eco-friendly housing project needs solar heaters and tanks' }] },
  { id: genId(), createdAt: '2026-02-21', assignedTo: 'Karan Patel', branch: 'Yelankha', status: 'Order Placed', cartValue: 178500, cartItems: [{ name: 'Interior Emulsion Paint 20L', qty: 15, price: 4200 }, { name: 'Putty 40kg', qty: 50, price: 2310 }], followUpDate: '2026-03-07', closureDate: '2026-03-15', remarks: [{ ts: '2026-02-21T14:30:00', author: 'Karan Patel', text: 'Interior painting supplies for school renovation' }] },
  { id: genId(), createdAt: '2026-02-19', assignedTo: 'Arjun Mehta', branch: 'HQ', status: 'Delivered', cartValue: 567000, cartItems: [{ name: 'TMT Steel Bars 20mm', qty: 300, price: 1890 }], followUpDate: '', closureDate: '2026-03-02', remarks: [{ ts: '2026-03-02T10:00:00', author: 'Arjun Mehta', text: 'Heavy gauge steel delivered for bridge reinforcement project' }] },
  // 31-40
  { id: genId(), createdAt: '2026-02-18', assignedTo: 'Priya Sharma', branch: 'JP Nagar', status: 'Order Lost', lostReason: 'Enquiry Cancelled', cartValue: 145000, cartItems: [{ name: 'Glass Wool Insulation', qty: 100, price: 850 }, { name: 'Aluminium Foil Tape', qty: 200, price: 300 }], followUpDate: '', closureDate: '', remarks: [{ ts: '2026-02-25T09:00:00', author: 'Priya Sharma', text: 'Project delayed indefinitely, client cancelled inquiry' }] },
  { id: genId(), createdAt: '2026-02-17', assignedTo: 'Rahul Verma', branch: 'Whitefield', status: 'Request for Availability Check', cartValue: 412000, cartItems: [{ name: 'Pre-fabricated Steel Trusses', qty: 10, price: 41200 }], followUpDate: '2026-03-03', closureDate: '2026-03-15', remarks: [{ ts: '2026-02-17T15:00:00', author: 'Rahul Verma', text: 'Industrial shed project - checking truss availability with supplier' }] },
  { id: genId(), createdAt: '2026-02-16', assignedTo: 'Sneha Iyer', branch: 'Yelankha', status: 'Quote Approval Pending', cartValue: 234500, cartItems: [{ name: 'Laminate Flooring', qty: 200, price: 890 }, { name: 'Underlay Foam 3mm', qty: 200, price: 283 }], followUpDate: '2026-03-02', closureDate: '2026-03-12', remarks: [{ ts: '2026-02-16T11:00:00', author: 'Sneha Iyer', text: 'Office renovation - laminate for 3 floors' }] },
  { id: genId(), createdAt: '2026-02-14', assignedTo: 'Karan Patel', branch: 'HQ', status: 'Delivered', cartValue: 189000, cartItems: [{ name: 'Bathroom Tiles Designer', qty: 150, price: 780 }, { name: 'Shower Panel SS', qty: 10, price: 7200 }], followUpDate: '', closureDate: '2026-02-28', remarks: [{ ts: '2026-02-28T16:00:00', author: 'Karan Patel', text: 'Premium bathroom fittings delivered for luxury villa' }] },
  { id: genId(), createdAt: '2026-02-13', assignedTo: 'Arjun Mehta', branch: 'JP Nagar', status: 'Order Placed', cartValue: 312000, cartItems: [{ name: 'RCC Hume Pipes 600mm', qty: 20, price: 8500 }, { name: 'RCC Hume Pipes 900mm', qty: 10, price: 14200 }], followUpDate: '2026-02-27', closureDate: '2026-03-10', remarks: [{ ts: '2026-02-13T08:00:00', author: 'Arjun Mehta', text: 'Drainage project for new layout development' }] },
  { id: genId(), createdAt: '2026-02-12', assignedTo: 'Priya Sharma', branch: 'Whitefield', status: 'Refunded', cartValue: 56000, cartItems: [{ name: 'Weatherproof Exterior Paint 20L', qty: 8, price: 7000 }], followUpDate: '', closureDate: '2026-02-20', remarks: [{ ts: '2026-02-20T13:00:00', author: 'Priya Sharma', text: 'Color mismatch with sample, refund processed' }] },
  { id: genId(), createdAt: '2026-02-11', assignedTo: 'Rahul Verma', branch: 'Yelankha', status: 'Delivered', cartValue: 678000, cartItems: [{ name: 'Reinforcement Steel Bundle', qty: 15, price: 32000 }, { name: 'Portland Cement 50kg', qty: 200, price: 1140 }], followUpDate: '', closureDate: '2026-02-25', remarks: [{ ts: '2026-02-25T09:30:00', author: 'Rahul Verma', text: 'Full material delivered for multi-story residential project' }] },
  { id: genId(), createdAt: '2026-02-10', assignedTo: 'Sneha Iyer', branch: 'HQ', status: 'Quote Approval Pending', cartValue: 123000, cartItems: [{ name: 'Electrical Wires 2.5sqmm', qty: 50, price: 1460 }, { name: 'MCB Distribution Board', qty: 10, price: 5000 }], followUpDate: '2026-02-24', closureDate: '2026-03-05', remarks: [{ ts: '2026-02-10T10:30:00', author: 'Sneha Iyer', text: 'Electrical fitout quote for commercial space' }] },
  { id: genId(), createdAt: '2026-02-09', assignedTo: 'Karan Patel', branch: 'JP Nagar', status: 'Order Lost', lostReason: 'Sample/Material Not Approved', cartValue: 245000, cartItems: [{ name: 'Modular Kitchen Cabinet Set', qty: 3, price: 65000 }, { name: 'Granite Kitchen Counter', qty: 3, price: 16667 }], followUpDate: '', closureDate: '', remarks: [{ ts: '2026-02-18T11:00:00', author: 'Karan Patel', text: 'Client chose a modular kitchen specialist instead' }] },
  { id: genId(), createdAt: '2026-02-08', assignedTo: 'Arjun Mehta', branch: 'Whitefield', status: 'Order Placed', cartValue: 87000, cartItems: [{ name: 'Cement Board 8mm', qty: 100, price: 520 }, { name: 'Self-drilling Screws Box', qty: 50, price: 340 }], followUpDate: '2026-02-22', closureDate: '2026-03-01', remarks: [{ ts: '2026-02-08T16:00:00', author: 'Arjun Mehta', text: 'Partition wall material for co-working space' }] },
  // 41-50
  { id: genId(), createdAt: '2026-02-07', assignedTo: 'Priya Sharma', branch: 'Yelankha', status: 'Delivered', cartValue: 345000, cartItems: [{ name: 'UPVC Windows 5x4', qty: 20, price: 11500 }, { name: 'UPVC Door Frame', qty: 10, price: 11500 }], followUpDate: '', closureDate: '2026-02-20', remarks: [{ ts: '2026-02-20T14:00:00', author: 'Priya Sharma', text: 'UPVC installation completed at Electronic City villa' }] },
  { id: genId(), createdAt: '2026-02-06', assignedTo: 'Rahul Verma', branch: 'HQ', status: 'Request for Availability Check', cartValue: 198000, cartItems: [{ name: 'Polycarbonate Roofing Sheet', qty: 50, price: 2800 }, { name: 'Roofing Accessories Kit', qty: 10, price: 5800 }], followUpDate: '2026-02-20', closureDate: '2026-03-01', remarks: [{ ts: '2026-02-06T09:00:00', author: 'Rahul Verma', text: 'Parking shed roofing for apartment complex' }] },
  { id: genId(), createdAt: '2026-02-05', assignedTo: 'Sneha Iyer', branch: 'JP Nagar', status: 'Quote Approval Pending', cartValue: 567000, cartItems: [{ name: 'Italian Marble Tiles', qty: 200, price: 2100 }, { name: 'Epoxy Grouting', qty: 100, price: 470 }, { name: 'Tile Spacers & Levellers', qty: 50, price: 560 }], followUpDate: '2026-02-19', closureDate: '2026-03-01', remarks: [{ ts: '2026-02-05T13:30:00', author: 'Sneha Iyer', text: 'Premium villa project wants Italian marble for all floors' }] },
  { id: genId(), createdAt: '2026-02-04', assignedTo: 'Karan Patel', branch: 'Whitefield', status: 'Order Placed', cartValue: 145000, cartItems: [{ name: 'MS Railing Pipe 2 inch', qty: 100, price: 950 }, { name: 'SS Railing Accessories', qty: 50, price: 1000 }], followUpDate: '2026-02-18', closureDate: '2026-02-25', remarks: [{ ts: '2026-02-04T10:00:00', author: 'Karan Patel', text: 'Staircase railing material for 4-floor building' }] },
  { id: genId(), createdAt: '2026-02-03', assignedTo: 'Arjun Mehta', branch: 'Yelankha', status: 'Delivered', cartValue: 234000, cartItems: [{ name: 'Solid Wood Doors', qty: 12, price: 14500 }, { name: 'Door Hardware Set', qty: 12, price: 5000 }], followUpDate: '', closureDate: '2026-02-18', remarks: [{ ts: '2026-02-18T11:30:00', author: 'Arjun Mehta', text: 'Premium teak doors delivered and installed' }] },
  { id: genId(), createdAt: '2026-02-02', assignedTo: 'Priya Sharma', branch: 'HQ', status: 'Order Lost', lostReason: 'Credit Issue', cartValue: 89000, cartItems: [{ name: 'Corrugated Metal Sheets', qty: 60, price: 1483 }], followUpDate: '', closureDate: '', remarks: [{ ts: '2026-02-10T14:30:00', author: 'Priya Sharma', text: 'Budget constraints - client postponed the project' }] },
  { id: genId(), createdAt: '2026-02-01', assignedTo: 'Rahul Verma', branch: 'JP Nagar', status: 'Refunded', cartValue: 78500, cartItems: [{ name: 'Bathroom Vanity Unit', qty: 5, price: 15700 }], followUpDate: '', closureDate: '2026-02-12', remarks: [{ ts: '2026-02-12T10:00:00', author: 'Rahul Verma', text: 'Size mismatch with client bathroom dimensions, refund issued' }] },
  { id: genId(), createdAt: '2026-01-31', assignedTo: 'Sneha Iyer', branch: 'Whitefield', status: 'Delivered', cartValue: 890000, cartItems: [{ name: 'Structural Steel Columns', qty: 25, price: 28000 }, { name: 'Base Plates & Anchor Bolts', qty: 25, price: 7600 }], followUpDate: '', closureDate: '2026-02-15', remarks: [{ ts: '2026-02-15T08:00:00', author: 'Sneha Iyer', text: 'Steel structure for warehouse delivered on schedule' }] },
  { id: genId(), createdAt: '2026-01-30', assignedTo: 'Karan Patel', branch: 'Yelankha', status: 'Request for Availability Check', cartValue: 156000, cartItems: [{ name: 'SWR Pipes 110mm', qty: 100, price: 890 }, { name: 'SWR Fittings Assorted', qty: 80, price: 838 }], followUpDate: '2026-02-13', closureDate: '2026-02-22', remarks: [{ ts: '2026-01-30T15:30:00', author: 'Karan Patel', text: 'Soil and waste pipe system for apartment block' }] },
  { id: genId(), createdAt: '2026-01-29', assignedTo: 'Arjun Mehta', branch: 'HQ', status: 'Quote Approval Pending', cartValue: 423000, cartItems: [{ name: 'Fire-rated Doors', qty: 10, price: 28500 }, { name: 'Fire Extinguisher Set', qty: 20, price: 6900 }], followUpDate: '2026-02-12', closureDate: '2026-02-22', remarks: [{ ts: '2026-01-29T09:00:00', author: 'Arjun Mehta', text: 'Fire safety compliance materials for commercial building' }] },
  // 51-60
  { id: genId(), createdAt: '2026-01-28', assignedTo: 'Priya Sharma', branch: 'JP Nagar', status: 'Delivered', cartValue: 167000, cartItems: [{ name: 'Ceramic Roof Tiles', qty: 500, price: 210 }, { name: 'Ridge Tiles', qty: 100, price: 620 }], followUpDate: '', closureDate: '2026-02-10', remarks: [{ ts: '2026-02-10T12:00:00', author: 'Priya Sharma', text: 'Roofing tiles installed for heritage-style bungalow' }] },
  { id: genId(), createdAt: '2026-01-27', assignedTo: 'Rahul Verma', branch: 'Whitefield', status: 'Order Placed', cartValue: 256000, cartItems: [{ name: 'Precast Compound Wall', qty: 30, price: 6500 }, { name: 'Compound Wall Pillars', qty: 31, price: 1613 }], followUpDate: '2026-02-10', closureDate: '2026-02-18', remarks: [{ ts: '2026-01-27T14:00:00', author: 'Rahul Verma', text: 'Boundary wall for factory premises' }] },
  { id: genId(), createdAt: '2026-01-26', assignedTo: 'Sneha Iyer', branch: 'Yelankha', status: 'Refunded', cartValue: 43000, cartItems: [{ name: 'Epoxy Floor Paint 20L', qty: 5, price: 8600 }], followUpDate: '', closureDate: '2026-02-05', remarks: [{ ts: '2026-02-05T11:00:00', author: 'Sneha Iyer', text: 'Client changed floor plan, no longer needs epoxy coating' }] },
  { id: genId(), createdAt: '2026-01-25', assignedTo: 'Karan Patel', branch: 'HQ', status: 'Order Lost', lostReason: 'Enquiry Invalid', cartValue: 312000, cartItems: [{ name: 'Elevator Lift Package', qty: 1, price: 312000 }], followUpDate: '', closureDate: '', remarks: [{ ts: '2026-02-01T09:30:00', author: 'Karan Patel', text: 'Client directly contacted the elevator manufacturer' }] },
  { id: genId(), createdAt: '2026-01-24', assignedTo: 'Arjun Mehta', branch: 'JP Nagar', status: 'Delivered', cartValue: 198000, cartItems: [{ name: 'Plumbing PVC Pipes 4 inch', qty: 100, price: 780 }, { name: 'Plumbing Fittings Kit', qty: 50, price: 2400 }], followUpDate: '', closureDate: '2026-02-08', remarks: [{ ts: '2026-02-08T14:00:00', author: 'Arjun Mehta', text: 'Complete plumbing material delivered for row house project' }] },
  { id: genId(), createdAt: '2026-01-23', assignedTo: 'Priya Sharma', branch: 'Whitefield', status: 'Request for Availability Check', cartValue: 534000, cartItems: [{ name: 'ACP Cladding Sheets', qty: 100, price: 3200 }, { name: 'ACP Fixing Channels', qty: 100, price: 2140 }], followUpDate: '2026-02-06', closureDate: '2026-02-16', remarks: [{ ts: '2026-01-23T10:00:00', author: 'Priya Sharma', text: 'Facade cladding for office building exterior' }] },
  { id: genId(), createdAt: '2026-01-22', assignedTo: 'Rahul Verma', branch: 'Yelankha', status: 'Quote Approval Pending', cartValue: 189000, cartItems: [{ name: 'Clay Hollow Bricks', qty: 3000, price: 42 }, { name: 'Cement Mortar Mix', qty: 100, price: 630 }], followUpDate: '2026-02-05', closureDate: '2026-02-15', remarks: [{ ts: '2026-01-22T13:30:00', author: 'Rahul Verma', text: 'Non-load bearing walls for commercial complex' }] },
  { id: genId(), createdAt: '2026-01-21', assignedTo: 'Sneha Iyer', branch: 'HQ', status: 'Order Placed', cartValue: 267000, cartItems: [{ name: 'Split AC 1.5 Ton', qty: 10, price: 18500 }, { name: 'AC Copper Piping Kit', qty: 10, price: 8200 }], followUpDate: '2026-02-04', closureDate: '2026-02-12', remarks: [{ ts: '2026-01-21T11:00:00', author: 'Sneha Iyer', text: 'HVAC order for new office space fitout' }] },
  { id: genId(), createdAt: '2026-01-20', assignedTo: 'Karan Patel', branch: 'JP Nagar', status: 'Delivered', cartValue: 456000, cartItems: [{ name: 'Teak Wood Planks', qty: 50, price: 6500 }, { name: 'Sal Wood Beams', qty: 30, price: 5200 }], followUpDate: '', closureDate: '2026-02-05', remarks: [{ ts: '2026-02-05T15:00:00', author: 'Karan Patel', text: 'Premium timber delivered for custom furniture workshop' }] },
  { id: genId(), createdAt: '2026-01-19', assignedTo: 'Arjun Mehta', branch: 'Whitefield', status: 'Order Lost', lostReason: 'Delayed Estimate', cartValue: 178000, cartItems: [{ name: 'Bamboo Decking', qty: 100, price: 1280 }, { name: 'Deck Fasteners', qty: 50, price: 1040 }], followUpDate: '', closureDate: '', remarks: [{ ts: '2026-01-28T16:00:00', author: 'Arjun Mehta', text: 'Client switched to composite decking from another vendor' }] },
  // 61-70
  { id: genId(), createdAt: '2026-01-18', assignedTo: 'Priya Sharma', branch: 'Yelankha', status: 'Delivered', cartValue: 312000, cartItems: [{ name: 'Interlocking Pavers', qty: 1000, price: 180 }, { name: 'Paver Base Material', qty: 50, price: 2640 }], followUpDate: '', closureDate: '2026-02-01', remarks: [{ ts: '2026-02-01T10:00:00', author: 'Priya Sharma', text: 'Driveway paving completed for gated community' }] },
  { id: genId(), createdAt: '2026-01-17', assignedTo: 'Rahul Verma', branch: 'HQ', status: 'Quote Approval Pending', cartValue: 745000, cartItems: [{ name: 'Structural Glazing System', qty: 50, price: 12500 }, { name: 'Silicone Sealant Industrial', qty: 100, price: 1200 }], followUpDate: '2026-01-31', closureDate: '2026-02-10', remarks: [{ ts: '2026-01-17T14:00:00', author: 'Rahul Verma', text: 'Glass facade for 5-story commercial tower' }] },
  { id: genId(), createdAt: '2026-01-16', assignedTo: 'Sneha Iyer', branch: 'JP Nagar', status: 'Order Placed', cartValue: 98000, cartItems: [{ name: 'GI Wire 4mm', qty: 200, price: 290 }, { name: 'Chain Link Fencing 50m', qty: 5, price: 8000 }], followUpDate: '2026-01-30', closureDate: '2026-02-06', remarks: [{ ts: '2026-01-16T09:30:00', author: 'Sneha Iyer', text: 'Perimeter fencing for construction site' }] },
  { id: genId(), createdAt: '2026-01-15', assignedTo: 'Karan Patel', branch: 'Whitefield', status: 'Refunded', cartValue: 67000, cartItems: [{ name: 'Acrylic Exterior Paint 20L', qty: 10, price: 6700 }], followUpDate: '', closureDate: '2026-01-25', remarks: [{ ts: '2026-01-25T12:00:00', author: 'Karan Patel', text: 'Paint shade did not match expectation, refund processed' }] },
  { id: genId(), createdAt: '2026-01-14', assignedTo: 'Arjun Mehta', branch: 'Yelankha', status: 'Delivered', cartValue: 534000, cartItems: [{ name: 'Fly Ash Cement 50kg', qty: 300, price: 1080 }, { name: 'M-Sand Fine (per ton)', qty: 50, price: 3480 }], followUpDate: '', closureDate: '2026-01-28', remarks: [{ ts: '2026-01-28T08:30:00', author: 'Arjun Mehta', text: 'Bulk material delivered for foundation work' }] },
  { id: genId(), createdAt: '2026-01-13', assignedTo: 'Priya Sharma', branch: 'HQ', status: 'Request for Availability Check', cartValue: 278000, cartItems: [{ name: 'Toughened Glass 12mm', qty: 30, price: 6500 }, { name: 'Glass Railing Spigots', qty: 60, price: 1300 }], followUpDate: '2026-01-27', closureDate: '2026-02-05', remarks: [{ ts: '2026-01-13T11:30:00', author: 'Priya Sharma', text: 'Balcony glass railing for premium apartments' }] },
  { id: genId(), createdAt: '2026-01-12', assignedTo: 'Rahul Verma', branch: 'JP Nagar', status: 'Quote Approval Pending', cartValue: 456000, cartItems: [{ name: 'Pre-stressed Concrete Slabs', qty: 30, price: 12000 }, { name: 'Slab Lifting Anchors', qty: 60, price: 1600 }], followUpDate: '2026-01-26', closureDate: '2026-02-05', remarks: [{ ts: '2026-01-12T15:00:00', author: 'Rahul Verma', text: 'Precast slab system for industrial warehouse' }] },
  { id: genId(), createdAt: '2026-01-11', assignedTo: 'Sneha Iyer', branch: 'Whitefield', status: 'Delivered', cartValue: 123000, cartItems: [{ name: 'Ceiling Fan Industrial', qty: 30, price: 2800 }, { name: 'LED Panel Light 2x2', qty: 50, price: 780 }], followUpDate: '', closureDate: '2026-01-25', remarks: [{ ts: '2026-01-25T13:00:00', author: 'Sneha Iyer', text: 'Electrical fixtures installed in new office space' }] },
  { id: genId(), createdAt: '2026-01-10', assignedTo: 'Karan Patel', branch: 'Yelankha', status: 'Order Placed', cartValue: 189000, cartItems: [{ name: 'WPC Door Frames', qty: 20, price: 6500 }, { name: 'WPC Boards 18mm', qty: 30, price: 1967 }], followUpDate: '2026-01-24', closureDate: '2026-02-01', remarks: [{ ts: '2026-01-10T10:00:00', author: 'Karan Patel', text: 'Termite-proof door frames for residential complex' }] },
  { id: genId(), createdAt: '2026-01-09', assignedTo: 'Arjun Mehta', branch: 'HQ', status: 'Order Lost', lostReason: 'Pricing Issue', cartValue: 234000, cartItems: [{ name: 'Prefab Portable Cabin', qty: 2, price: 117000 }], followUpDate: '', closureDate: '', remarks: [{ ts: '2026-01-18T14:30:00', author: 'Arjun Mehta', text: 'Client found used portable cabins at lower cost' }] },
  // 71-80
  { id: genId(), createdAt: '2026-01-08', assignedTo: 'Priya Sharma', branch: 'JP Nagar', status: 'Delivered', cartValue: 345000, cartItems: [{ name: 'SS Water Tank 5000L', qty: 3, price: 78000 }, { name: 'Tank Stand MS', qty: 3, price: 37000 }], followUpDate: '', closureDate: '2026-01-22', remarks: [{ ts: '2026-01-22T09:00:00', author: 'Priya Sharma', text: 'Water storage tanks installed for apartment building' }] },
  { id: genId(), createdAt: '2026-01-07', assignedTo: 'Rahul Verma', branch: 'Whitefield', status: 'Refunded', cartValue: 89000, cartItems: [{ name: 'Anti-skid Floor Tiles', qty: 200, price: 445 }], followUpDate: '', closureDate: '2026-01-18', remarks: [{ ts: '2026-01-18T15:00:00', author: 'Rahul Verma', text: 'Tiles did not match the anti-skid rating specified, refund issued' }] },
  { id: genId(), createdAt: '2026-01-06', assignedTo: 'Sneha Iyer', branch: 'Yelankha', status: 'Quote Approval Pending', cartValue: 678000, cartItems: [{ name: 'Solar Panel 400W', qty: 20, price: 22000 }, { name: 'Solar Inverter 10kW', qty: 1, price: 238000 }], followUpDate: '2026-01-20', closureDate: '2026-01-30', remarks: [{ ts: '2026-01-06T12:00:00', author: 'Sneha Iyer', text: 'Commercial rooftop solar installation quote' }] },
  { id: genId(), createdAt: '2026-01-05', assignedTo: 'Karan Patel', branch: 'HQ', status: 'Order Placed', cartValue: 234000, cartItems: [{ name: 'Terracotta Jali Blocks', qty: 500, price: 280 }, { name: 'Sandstone Cladding', qty: 100, price: 940 }], followUpDate: '2026-01-19', closureDate: '2026-01-28', remarks: [{ ts: '2026-01-05T14:00:00', author: 'Karan Patel', text: 'Decorative facade elements for boutique hotel' }] },
  { id: genId(), createdAt: '2026-01-04', assignedTo: 'Arjun Mehta', branch: 'JP Nagar', status: 'Delivered', cartValue: 156000, cartItems: [{ name: 'Concrete Pavers Hexagonal', qty: 800, price: 120 }, { name: 'Edge Restraints', qty: 100, price: 600 }], followUpDate: '', closureDate: '2026-01-18', remarks: [{ ts: '2026-01-18T16:30:00', author: 'Arjun Mehta', text: 'Hexagonal paver driveway completed' }] },
  { id: genId(), createdAt: '2026-01-03', assignedTo: 'Priya Sharma', branch: 'Whitefield', status: 'Request for Availability Check', cartValue: 412000, cartItems: [{ name: 'Engineered Wood Flooring', qty: 150, price: 1800 }, { name: 'Floor Skirting', qty: 100, price: 1420 }], followUpDate: '2026-01-17', closureDate: '2026-01-27', remarks: [{ ts: '2026-01-03T11:00:00', author: 'Priya Sharma', text: 'Premium wood flooring for penthouse apartments' }] },
  { id: genId(), createdAt: '2026-01-02', assignedTo: 'Rahul Verma', branch: 'Yelankha', status: 'Order Lost', lostReason: 'Cash/Non GST Issue', cartValue: 567000, cartItems: [{ name: 'Central AC Package 5TR', qty: 2, price: 245000 }, { name: 'Ducting Material', qty: 1, price: 77000 }], followUpDate: '', closureDate: '', remarks: [{ ts: '2026-01-12T09:00:00', author: 'Rahul Verma', text: 'Lost to HVAC specialist dealer with better AMC terms' }] },
  { id: genId(), createdAt: '2026-01-01', assignedTo: 'Sneha Iyer', branch: 'HQ', status: 'Delivered', cartValue: 289000, cartItems: [{ name: 'Mosaic Tiles Designer', qty: 300, price: 650 }, { name: 'Swimming Pool Tiles', qty: 200, price: 475 }], followUpDate: '', closureDate: '2026-01-15', remarks: [{ ts: '2026-01-15T10:30:00', author: 'Sneha Iyer', text: 'Pool and garden area tiling completed at farmhouse' }] },
  { id: genId(), createdAt: '2025-12-31', assignedTo: 'Karan Patel', branch: 'JP Nagar', status: 'Quote Approval Pending', cartValue: 345000, cartItems: [{ name: 'SS Railing System', qty: 50, price: 4500 }, { name: 'Glass Panels 10mm', qty: 25, price: 4800 }], followUpDate: '2026-01-14', closureDate: '2026-01-24', remarks: [{ ts: '2025-12-31T08:00:00', author: 'Karan Patel', text: 'Glass and steel railing for duplex staircase' }] },
  { id: genId(), createdAt: '2025-12-30', assignedTo: 'Arjun Mehta', branch: 'Whitefield', status: 'Order Placed', cartValue: 178000, cartItems: [{ name: 'Rockwool Insulation 50mm', qty: 100, price: 1180 }, { name: 'Vapour Barrier Film', qty: 50, price: 1240 }], followUpDate: '2026-01-13', closureDate: '2026-01-22', remarks: [{ ts: '2025-12-30T13:00:00', author: 'Arjun Mehta', text: 'Thermal insulation for cold storage facility' }] },
  // 81-90
  { id: genId(), createdAt: '2025-12-29', assignedTo: 'Priya Sharma', branch: 'Yelankha', status: 'Delivered', cartValue: 432000, cartItems: [{ name: 'RCC Manhole Covers', qty: 50, price: 3200 }, { name: 'PVC Manhole Chamber', qty: 25, price: 11680 }], followUpDate: '', closureDate: '2026-01-12', remarks: [{ ts: '2026-01-12T14:00:00', author: 'Priya Sharma', text: 'Drainage infrastructure delivered for township project' }] },
  { id: genId(), createdAt: '2025-12-28', assignedTo: 'Rahul Verma', branch: 'HQ', status: 'Refunded', cartValue: 45000, cartItems: [{ name: 'Wooden Flooring Polish', qty: 20, price: 2250 }], followUpDate: '', closureDate: '2026-01-08', remarks: [{ ts: '2026-01-08T11:00:00', author: 'Rahul Verma', text: 'Wrong shade of polish, client returned entire batch' }] },
  { id: genId(), createdAt: '2025-12-27', assignedTo: 'Sneha Iyer', branch: 'JP Nagar', status: 'Order Placed', cartValue: 567000, cartItems: [{ name: 'MS Structural Steel', qty: 10, price: 45000 }, { name: 'Welding Electrodes Box', qty: 20, price: 5850 }], followUpDate: '2026-01-10', closureDate: '2026-01-20', remarks: [{ ts: '2025-12-27T15:00:00', author: 'Sneha Iyer', text: 'Steel structure for factory mezzanine floor' }] },
  { id: genId(), createdAt: '2025-12-26', assignedTo: 'Karan Patel', branch: 'Whitefield', status: 'Quote Approval Pending', cartValue: 234000, cartItems: [{ name: 'Wooden Acoustic Panels', qty: 100, price: 1540 }, { name: 'Acoustic Foam Tiles', qty: 100, price: 800 }], followUpDate: '2026-01-09', closureDate: '2026-01-19', remarks: [{ ts: '2025-12-26T10:00:00', author: 'Karan Patel', text: 'Sound treatment material for recording studio' }] },
  { id: genId(), createdAt: '2025-12-25', assignedTo: 'Arjun Mehta', branch: 'Yelankha', status: 'Delivered', cartValue: 789000, cartItems: [{ name: 'Precast Boundary Wall Panel', qty: 40, price: 15000 }, { name: 'Precast Pillar', qty: 41, price: 4854 }], followUpDate: '', closureDate: '2026-01-10', remarks: [{ ts: '2026-01-10T09:00:00', author: 'Arjun Mehta', text: 'Precast compound wall erected for industrial plot' }] },
  { id: genId(), createdAt: '2025-12-24', assignedTo: 'Priya Sharma', branch: 'HQ', status: 'Order Lost', lostReason: 'Sample/Material Not Approved', cartValue: 123000, cartItems: [{ name: 'Cement Board Siding', qty: 80, price: 1538 }], followUpDate: '', closureDate: '', remarks: [{ ts: '2026-01-03T10:00:00', author: 'Priya Sharma', text: 'Client opted for traditional plastering instead' }] },
  { id: genId(), createdAt: '2025-12-23', assignedTo: 'Rahul Verma', branch: 'JP Nagar', status: 'Request for Availability Check', cartValue: 345000, cartItems: [{ name: 'Granite Cobblestones', qty: 500, price: 450 }, { name: 'Landscaping Pebbles (per ton)', qty: 10, price: 12000 }], followUpDate: '2026-01-06', closureDate: '2026-01-16', remarks: [{ ts: '2025-12-23T13:30:00', author: 'Rahul Verma', text: 'Landscape material for resort entrance pathway' }] },
  { id: genId(), createdAt: '2025-12-22', assignedTo: 'Sneha Iyer', branch: 'Whitefield', status: 'Order Placed', cartValue: 456000, cartItems: [{ name: 'DG Set 125 KVA', qty: 1, price: 456000 }], followUpDate: '2026-01-05', closureDate: '2026-01-15', remarks: [{ ts: '2025-12-22T14:00:00', author: 'Sneha Iyer', text: 'Backup power generator for apartment complex' }] },
  { id: genId(), createdAt: '2025-12-21', assignedTo: 'Karan Patel', branch: 'Yelankha', status: 'Delivered', cartValue: 178000, cartItems: [{ name: 'PVC False Ceiling Panels', qty: 300, price: 380 }, { name: 'Ceiling Grid System', qty: 100, price: 640 }], followUpDate: '', closureDate: '2026-01-05', remarks: [{ ts: '2026-01-05T11:30:00', author: 'Karan Patel', text: 'PVC ceiling installed in hospital OPD area' }] },
  { id: genId(), createdAt: '2025-12-20', assignedTo: 'Arjun Mehta', branch: 'HQ', status: 'Refunded', cartValue: 89000, cartItems: [{ name: 'Designer Wall Cladding', qty: 50, price: 1780 }], followUpDate: '', closureDate: '2025-12-30', remarks: [{ ts: '2025-12-30T16:00:00', author: 'Arjun Mehta', text: 'Wall cladding pattern discontinued by manufacturer, refunded' }] },
  // 91-100
  { id: genId(), createdAt: '2025-12-19', assignedTo: 'Priya Sharma', branch: 'JP Nagar', status: 'Delivered', cartValue: 234000, cartItems: [{ name: 'Scaffolding Set (per floor)', qty: 4, price: 45000 }, { name: 'Safety Nets', qty: 10, price: 5400 }], followUpDate: '', closureDate: '2026-01-02', remarks: [{ ts: '2026-01-02T08:00:00', author: 'Priya Sharma', text: 'Scaffolding and safety equipment for building renovation' }] },
  { id: genId(), createdAt: '2025-12-18', assignedTo: 'Rahul Verma', branch: 'Whitefield', status: 'Quote Approval Pending', cartValue: 567000, cartItems: [{ name: 'Curtain Wall System', qty: 20, price: 22000 }, { name: 'Thermal Break Profiles', qty: 40, price: 3175 }], followUpDate: '2026-01-01', closureDate: '2026-01-11', remarks: [{ ts: '2025-12-18T10:00:00', author: 'Rahul Verma', text: 'Curtain wall quote for tech park building' }] },
  { id: genId(), createdAt: '2025-12-17', assignedTo: 'Sneha Iyer', branch: 'Yelankha', status: 'Order Placed', cartValue: 145000, cartItems: [{ name: 'GI Square Tubes', qty: 100, price: 950 }, { name: 'MS Flat Bar', qty: 100, price: 500 }], followUpDate: '2025-12-31', closureDate: '2026-01-08', remarks: [{ ts: '2025-12-17T15:30:00', author: 'Sneha Iyer', text: 'Metal fabrication material for gate and grills' }] },
  { id: genId(), createdAt: '2025-12-16', assignedTo: 'Karan Patel', branch: 'HQ', status: 'Order Lost', lostReason: 'Order Closed Already', cartValue: 890000, cartItems: [{ name: 'Modular OT Panel System', qty: 2, price: 445000 }], followUpDate: '', closureDate: '', remarks: [{ ts: '2025-12-26T09:00:00', author: 'Karan Patel', text: 'Hospital went with specialized OT infrastructure vendor' }] },
  { id: genId(), createdAt: '2025-12-15', assignedTo: 'Arjun Mehta', branch: 'JP Nagar', status: 'Delivered', cartValue: 345000, cartItems: [{ name: 'Weathering Steel Plates', qty: 20, price: 12500 }, { name: 'Corten Steel Panels', qty: 15, price: 7000 }], followUpDate: '', closureDate: '2025-12-30', remarks: [{ ts: '2025-12-30T12:00:00', author: 'Arjun Mehta', text: 'Decorative steel panels for building entrance facade' }] },
  { id: genId(), createdAt: '2025-12-14', assignedTo: 'Priya Sharma', branch: 'Whitefield', status: 'Request for Availability Check', cartValue: 234000, cartItems: [{ name: 'Calcium Silicate Board', qty: 200, price: 750 }, { name: 'Fire Stop Sealant', qty: 50, price: 1180 }], followUpDate: '2025-12-28', closureDate: '2026-01-07', remarks: [{ ts: '2025-12-14T11:00:00', author: 'Priya Sharma', text: 'Fire-rated partition material for server room' }] },
  { id: genId(), createdAt: '2025-12-13', assignedTo: 'Rahul Verma', branch: 'Yelankha', status: 'Delivered', cartValue: 178000, cartItems: [{ name: 'Rubber Flooring Tiles', qty: 200, price: 650 }, { name: 'Rubber Adhesive 20L', qty: 10, price: 4800 }], followUpDate: '', closureDate: '2025-12-28', remarks: [{ ts: '2025-12-28T14:30:00', author: 'Rahul Verma', text: 'Gym rubber flooring installed at sports complex' }] },
  { id: genId(), createdAt: '2025-12-12', assignedTo: 'Sneha Iyer', branch: 'HQ', status: 'Quote Approval Pending', cartValue: 412000, cartItems: [{ name: 'Rainwater Harvesting System', qty: 2, price: 156000 }, { name: 'Water Filtration Unit', qty: 2, price: 50000 }], followUpDate: '2025-12-26', closureDate: '2026-01-05', remarks: [{ ts: '2025-12-12T09:30:00', author: 'Sneha Iyer', text: 'Rainwater harvesting for eco-certified apartment complex' }] },
  { id: genId(), createdAt: '2025-12-11', assignedTo: 'Karan Patel', branch: 'JP Nagar', status: 'Order Placed', cartValue: 267000, cartItems: [{ name: 'Reinforced Earth Wall Panels', qty: 20, price: 9500 }, { name: 'Geotextile Fabric Roll', qty: 10, price: 7700 }], followUpDate: '2025-12-25', closureDate: '2026-01-04', remarks: [{ ts: '2025-12-11T13:00:00', author: 'Karan Patel', text: 'Retaining wall material for hillside construction' }] },
  { id: genId(), createdAt: '2025-12-10', assignedTo: 'Arjun Mehta', branch: 'Whitefield', status: 'Delivered', cartValue: 523000, cartItems: [{ name: 'Tremix Flooring Material', qty: 100, price: 3500 }, { name: 'Expansion Joint Filler', qty: 50, price: 1460 }], followUpDate: '', closureDate: '2025-12-25', remarks: [{ ts: '2025-12-25T10:00:00', author: 'Arjun Mehta', text: 'Industrial tremix flooring completed for warehouse' }] },
  // 101-110
  { id: genId(), createdAt: '2025-12-09', assignedTo: 'Priya Sharma', branch: 'Yelankha', status: 'Refunded', cartValue: 56000, cartItems: [{ name: 'Texture Paint 20L', qty: 8, price: 7000 }], followUpDate: '', closureDate: '2025-12-20', remarks: [{ ts: '2025-12-20T15:00:00', author: 'Priya Sharma', text: 'Texture effect not as shown in catalog, refund issued' }] },
  { id: genId(), createdAt: '2025-12-08', assignedTo: 'Rahul Verma', branch: 'HQ', status: 'Order Lost', lostReason: 'Enquiry Cancelled', cartValue: 345000, cartItems: [{ name: 'Automatic Sliding Gate', qty: 2, price: 125000 }, { name: 'Gate Motor Kit', qty: 2, price: 47500 }], followUpDate: '', closureDate: '', remarks: [{ ts: '2025-12-18T09:30:00', author: 'Rahul Verma', text: 'Client went with local fabricator for manual gates' }] },
  { id: genId(), createdAt: '2025-12-07', assignedTo: 'Sneha Iyer', branch: 'JP Nagar', status: 'Delivered', cartValue: 189000, cartItems: [{ name: 'Geomembrane HDPE', qty: 500, price: 250 }, { name: 'Geocomposite Drain', qty: 100, price: 640 }], followUpDate: '', closureDate: '2025-12-22', remarks: [{ ts: '2025-12-22T11:00:00', author: 'Sneha Iyer', text: 'Waterproofing membrane for underground parking' }] },
  { id: genId(), createdAt: '2025-12-06', assignedTo: 'Karan Patel', branch: 'Whitefield', status: 'Quote Approval Pending', cartValue: 456000, cartItems: [{ name: 'Composite Decking WPC', qty: 200, price: 1500 }, { name: 'Deck Railing System', qty: 50, price: 3120 }], followUpDate: '2025-12-20', closureDate: '2025-12-30', remarks: [{ ts: '2025-12-06T14:00:00', author: 'Karan Patel', text: 'Rooftop terrace decking for luxury penthouse' }] },
  { id: genId(), createdAt: '2025-12-05', assignedTo: 'Arjun Mehta', branch: 'Yelankha', status: 'Request for Availability Check', cartValue: 678000, cartItems: [{ name: 'VRF AC System 20TR', qty: 1, price: 520000 }, { name: 'AC Ducting & Grills', qty: 1, price: 158000 }], followUpDate: '2025-12-19', closureDate: '2025-12-30', remarks: [{ ts: '2025-12-05T10:30:00', author: 'Arjun Mehta', text: 'Central AC system for new office tower' }] },
];

// ── Components ──────────────────────────────────────────────────────────────

function Avatar({ name, size = 24 }) {
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  return (
    <div style={{ ...S.avatar, width: size, height: size, fontSize: size * 0.45, lineHeight: size + 'px' }}>
      {initial}
    </div>
  );
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || '#9CA3AF';
  return (
    <span style={{ ...S.statusBadge, background: color + '18', color, borderColor: color + '40' }}>
      {status}
    </span>
  );
}

function EditableStatus({ status, lostReason, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [pendingLost, setPendingLost] = useState(false);

  if (pendingLost) {
    return (
      <select
        autoFocus
        value=""
        onChange={(e) => { onCommit('Order Lost', e.target.value); setPendingLost(false); setEditing(false); }}
        onBlur={() => { setPendingLost(false); setEditing(false); }}
        style={{ ...S.statusSelect, borderColor: '#EF4444' }}
      >
        <option value="" disabled>Select reason...</option>
        {ORDER_LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
    );
  }

  if (editing) {
    return (
      <select
        autoFocus
        value={status}
        onChange={(e) => {
          if (e.target.value === 'Order Lost') { setPendingLost(true); }
          else { onCommit(e.target.value); setEditing(false); }
        }}
        onBlur={() => setEditing(false)}
        style={S.statusSelect}
      >
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    );
  }
  return (
    <span onDoubleClick={() => setEditing(true)}>
      <StatusBadge status={status} />
      {status === 'Order Lost' && lostReason && <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{lostReason}</div>}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <div style={S.field}>
      <label style={S.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function Th({ label, sortKey, sortCol, sortDir, onSort, style }) {
  const active = sortCol === sortKey;
  return (
    <th
      style={{ ...S.th, cursor: sortKey ? 'pointer' : 'default', ...style }}
      onClick={() => sortKey && onSort(sortKey)}
    >
      {label}
      {sortKey && (
        <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3 }}>
          {active ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u21D5'}
        </span>
      )}
    </th>
  );
}

// ── Cart Items Editor ───────────────────────────────────────────────────────
function CartItemsEditor({ items, onChange }) {
  const update = (idx, field, value) => {
    const next = items.map((it, i) => i === idx ? { ...it, [field]: field === 'name' ? value : Number(value) || 0 } : it);
    onChange(next);
  };
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));
  const add = () => onChange([...items, { name: '', qty: 1, price: 0 }]);
  const total = items.reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <span style={{ ...S.fieldLabel, flex: 3 }}>ITEM NAME</span>
        <span style={{ ...S.fieldLabel, flex: 1, textAlign: 'center' }}>QTY</span>
        <span style={{ ...S.fieldLabel, flex: 1.5, textAlign: 'right' }}>RATE (\u20B9)</span>
        <span style={{ width: 28 }} />
      </div>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <input style={{ ...S.input, flex: 3 }} value={it.name} placeholder="Item name" onChange={(e) => update(i, 'name', e.target.value)} />
          <input style={{ ...S.input, flex: 1, textAlign: 'center' }} type="number" min="1" value={it.qty} onChange={(e) => update(i, 'qty', e.target.value)} />
          <input style={{ ...S.input, flex: 1.5, textAlign: 'right' }} type="number" min="0" value={it.price} onChange={(e) => update(i, 'price', e.target.value)} />
          <button style={S.removeBtn} onClick={() => remove(i)} title="Remove">&times;</button>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ ...S.addItemLink, cursor: 'pointer' }} onClick={add}>+ Add Item</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 13 }}>Subtotal: {fmtINR(total)}</span>
      </div>
    </div>
  );
}

// ── Follow-up Remark Prompt ─────────────────────────────────────────────────
function FollowUpRemarkPrompt({ oldDate, newDate, onConfirm, onCancel }) {
  const [text, setText] = useState('');
  return (
    <div style={S.overlay}>
      <div style={{ ...S.modalBox, maxWidth: 400 }}>
        <div style={S.modalHeader}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Follow-up Date Changed</span>
        </div>
        <div style={{ padding: 20 }}>
          <p style={{ marginBottom: 12, fontSize: 13 }}>
            <span style={{ color: '#9CA3AF' }}>{fmtDate(oldDate)}</span>
            {' \u2192 '}
            <span style={{ fontWeight: 600 }}>{fmtDate(newDate)}</span>
          </p>
          <label style={S.fieldLabel}>REASON FOR CHANGE *</label>
          <textarea
            style={{ ...S.input, width: '100%', minHeight: 80, marginTop: 4, resize: 'vertical' }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter reason for changing follow-up date..."
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button style={S.cancelBtn} onClick={onCancel}>Cancel</button>
            <button style={{ ...S.primaryBtn, opacity: text.trim() ? 1 : 0.5 }} disabled={!text.trim()} onClick={() => onConfirm(text.trim())}>Confirm</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Lead Drawer (Edit + Remarks in single view) ────────────────────────────
function LeadDrawer({ lead, onSave, onClose, onAddRemark }) {
  const isEdit = !!lead;
  const [form, setForm] = useState(() => lead ? { ...lead, branch: lead.branch || BRANCHES[0], lostReason: lead.lostReason || '', cartItems: lead.cartItems ? lead.cartItems.map(i => ({ ...i })) : [] } : {
    id: genId(), createdAt: todayStr(), assignedTo: SALES_PEOPLE[0], branch: BRANCHES[0], status: STATUSES[0],
    cartValue: 0, cartItems: [], followUpDate: '', closureDate: '', lostReason: '', remarks: [],
  });
  const origFollowUpDate = useRef(lead ? lead.followUpDate : '');
  const [fuPrompt, setFuPrompt] = useState(null);
  const [remarkAuthor, setRemarkAuthor] = useState(lead ? lead.assignedTo : SALES_PEOPLE[0]);
  const [remarkText, setRemarkText] = useState('');
  const timelineRef = useRef(null);

  useEffect(() => {
    const total = form.cartItems.reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
    if (total > 0) setForm((f) => ({ ...f, cartValue: total }));
  }, [form.cartItems]);

  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [form.remarks]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleFollowUpChange = (newDate) => {
    if (isEdit && origFollowUpDate.current && newDate !== origFollowUpDate.current) {
      setFuPrompt({ oldDate: origFollowUpDate.current, newDate });
    } else {
      set('followUpDate', newDate);
    }
  };

  const handleFuConfirm = (text) => {
    const remark = { ts: new Date().toISOString(), author: form.assignedTo, text };
    setForm((f) => ({
      ...f,
      followUpDate: fuPrompt.newDate,
      remarks: [...(f.remarks || []), remark],
    }));
    origFollowUpDate.current = fuPrompt.newDate;
    setFuPrompt(null);
  };

  const handleSave = () => {
    if (form.status === 'Order Lost' && !form.lostReason) {
      alert('Please select a reason for marking this lead as Order Lost.');
      return;
    }
    onSave(form);
  };

  const submitRemark = () => {
    if (!remarkText.trim()) return;
    const remark = { ts: new Date().toISOString(), author: remarkAuthor, text: remarkText.trim() };
    setForm((f) => ({ ...f, remarks: [...(f.remarks || []), remark] }));
    if (isEdit && onAddRemark) onAddRemark(remark);
    setRemarkText('');
  };

  const handleRemarkKeyDown = (e) => {
    if (e.ctrlKey && e.key === 'Enter') submitRemark();
  };

  const remarks = form.remarks || [];

  return (
    <>
      <div style={S.drawerBackdrop} onClick={onClose} />
      <div style={S.drawer}>
        <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
        {/* Header */}
        <div style={S.drawerHeader}>
          <div>
            <span style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>{isEdit ? 'Edit Lead' : 'Add New Lead'}</span>
            {isEdit && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#9CA3AF', marginLeft: 8 }}>{form.id}</span>}
          </div>
          <button style={S.closeBtn} onClick={onClose}>&times;</button>
        </div>

        {/* Scrollable content: Details + Remarks together */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Details Section */}
          <div style={{ padding: 20 }}>
            <div style={S.drawerSectionTitle}>Details</div>
            <div style={S.formGridDrawer}>
              <Field label="LEAD ID">
                <input style={{ ...S.input, width: '100%', fontFamily: "'JetBrains Mono', monospace", background: '#F3F4F6' }} value={form.id} readOnly />
              </Field>
              <Field label="CREATION DATE">
                <input style={{ ...S.input, width: '100%' }} type="date" value={form.createdAt} onChange={(e) => set('createdAt', e.target.value)} />
              </Field>
              <Field label="ASSIGNED TO">
                <select style={{ ...S.input, width: '100%' }} value={form.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
                  {SALES_PEOPLE.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="BRANCH">
                <select style={{ ...S.input, width: '100%' }} value={form.branch} onChange={(e) => set('branch', e.target.value)}>
                  {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="STATUS">
                <select style={{ ...S.input, width: '100%' }} value={form.status} onChange={(e) => { set('status', e.target.value); if (e.target.value !== 'Order Lost') set('lostReason', ''); }}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              {form.status === 'Order Lost' && (
                <Field label="LOST REASON">
                  <select style={{ ...S.input, width: '100%', borderColor: !form.lostReason ? '#EF4444' : undefined }} value={form.lostReason || ''} onChange={(e) => set('lostReason', e.target.value)}>
                    <option value="" disabled>Select reason...</option>
                    {ORDER_LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
              )}
              <Field label="FOLLOW-UP DATE">
                <input style={{ ...S.input, width: '100%' }} type="date" value={form.followUpDate} onChange={(e) => handleFollowUpChange(e.target.value)} />
              </Field>
              <Field label="CLOSURE EXPECTED">
                <input style={{ ...S.input, width: '100%' }} type="date" value={form.closureDate} onChange={(e) => set('closureDate', e.target.value)} />
              </Field>
              <Field label="CART VALUE">
                <input style={{ ...S.input, width: '100%', fontFamily: "'JetBrains Mono', monospace" }} type="number" min="0" value={form.cartValue} onChange={(e) => set('cartValue', Number(e.target.value) || 0)} />
              </Field>
            </div>
            <div style={{ marginTop: 8 }}>
              <label style={S.fieldLabel}>CART ITEMS</label>
              <CartItemsEditor items={form.cartItems} onChange={(items) => set('cartItems', items)} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
              <button style={{ ...S.primaryBtn, flex: 1 }} onClick={handleSave}>{isEdit ? 'Save Changes' : 'Add Lead'}</button>
            </div>
          </div>

          {/* Remarks Section */}
          {isEdit && (
            <div style={{ borderTop: '2px solid #E5E7EB' }}>
              <div style={{ padding: '16px 20px 0 20px' }}>
                <div style={S.drawerSectionTitle}>Remarks {remarks.length > 0 && <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({remarks.length})</span>}</div>
              </div>
              <div ref={timelineRef} style={{ padding: '12px 20px' }}>
                {remarks.length === 0 && <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No remarks yet</p>}
                {remarks.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 16, position: 'relative' }}>
                    {i < remarks.length - 1 && <div style={{ position: 'absolute', left: 13, top: 32, bottom: -16, width: 1, background: '#E5E7EB' }} />}
                    <Avatar name={r.author} size={28} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600 }}>{r.author}</span>
                        <span style={{ color: '#9CA3AF', marginLeft: 8 }}>{fmtTimestamp(r.ts)}</span>
                      </div>
                      <div style={S.remarkBubble}>{r.text}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '0 20px 20px 20px' }}>
                <select style={{ ...S.input, width: '100%', marginBottom: 8, fontSize: 12 }} value={remarkAuthor} onChange={(e) => setRemarkAuthor(e.target.value)}>
                  {SALES_PEOPLE.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <textarea
                  style={{ ...S.input, width: '100%', minHeight: 60, resize: 'vertical', fontSize: 12 }}
                  value={remarkText}
                  onChange={(e) => setRemarkText(e.target.value)}
                  onKeyDown={handleRemarkKeyDown}
                  placeholder="Add a remark... (Ctrl+Enter to submit)"
                />
                <button style={{ ...S.primaryBtn, width: '100%', marginTop: 8 }} disabled={!remarkText.trim()} onClick={submitRemark}>Add Remark</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {fuPrompt && (
        <FollowUpRemarkPrompt
          oldDate={fuPrompt.oldDate}
          newDate={fuPrompt.newDate}
          onConfirm={handleFuConfirm}
          onCancel={() => setFuPrompt(null)}
        />
      )}
    </>
  );
}

// ── Delete Confirmation ─────────────────────────────────────────────────────
function DeleteConfirm({ leadId, onConfirm, onCancel }) {
  return (
    <div style={S.overlay}>
      <div style={{ ...S.modalBox, maxWidth: 360 }}>
        <div style={S.modalHeader}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Delete Lead</span>
        </div>
        <div style={{ padding: 20, textAlign: 'center' }}>
          <p style={{ marginBottom: 16, fontSize: 13 }}>Are you sure you want to delete lead <strong>{leadId}</strong>? This action cannot be undone.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button style={S.cancelBtn} onClick={onCancel}>Cancel</button>
            <button style={{ ...S.primaryBtn, background: '#EF4444' }} onClick={onConfirm}>Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [leads, setLeads] = useState(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((l) => ({ ...l, branch: l.branch || BRANCHES[Math.floor(Math.random() * BRANCHES.length)] }));
        }
      }
    } catch (e) { /* ignore */ }
    return SEED_LEADS;
  });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortCol, setSortCol] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [drawerLead, setDrawerLead] = useState(null);
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [deleteLead, setDeleteLead] = useState(null);

  // Persist to localStorage
  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(leads)); }, [leads]);

  // Base filtered leads (all filters except status — so pipeline & stage cards react to filters)
  const baseFiltered = leads.filter((l) => {
    if (personFilter && l.assignedTo !== personFilter) return false;
    if (branchFilter && l.branch !== branchFilter) return false;
    if (dateFrom && l.createdAt < dateFrom) return false;
    if (dateTo && l.createdAt > dateTo) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchId = l.id.toLowerCase().includes(q);
      const matchPerson = l.assignedTo.toLowerCase().includes(q);
      const matchItems = (l.cartItems || []).some((it) => it.name.toLowerCase().includes(q));
      if (!matchId && !matchPerson && !matchItems) return false;
    }
    return true;
  });

  // Pipeline computations (from filtered leads, excluding status filter)
  const pipelineTotal = baseFiltered.reduce((s, l) => s + (l.cartValue || 0), 0);
  const pipelineActive = baseFiltered.filter((l) => PIPELINE_BUCKETS.Active.includes(l.status)).reduce((s, l) => s + (l.cartValue || 0), 0);
  const pipelineWon = baseFiltered.filter((l) => PIPELINE_BUCKETS.Won.includes(l.status)).reduce((s, l) => s + (l.cartValue || 0), 0);
  const pipelineLost = baseFiltered.filter((l) => PIPELINE_BUCKETS.Lost.includes(l.status)).reduce((s, l) => s + (l.cartValue || 0), 0);
  const pctWon = pipelineTotal ? (pipelineWon / pipelineTotal) * 100 : 0;
  const pctActive = pipelineTotal ? (pipelineActive / pipelineTotal) * 100 : 0;
  const pctLost = pipelineTotal ? (pipelineLost / pipelineTotal) * 100 : 0;

  // Stage summary (from filtered leads)
  const stageSummary = STATUSES.map((status) => {
    const stageLeads = baseFiltered.filter((l) => l.status === status);
    return { status, count: stageLeads.length, value: stageLeads.reduce((s, l) => s + (l.cartValue || 0), 0) };
  });

  // Per-status chips for pipeline panel
  const statusChips = stageSummary.filter((s) => s.value > 0);

  // Active lead counts for pipeline metrics
  const activeCount = baseFiltered.filter((l) => PIPELINE_BUCKETS.Active.includes(l.status)).length;
  const wonCount = baseFiltered.filter((l) => PIPELINE_BUCKETS.Won.includes(l.status)).length;
  const lostCount = baseFiltered.filter((l) => PIPELINE_BUCKETS.Lost.includes(l.status)).length;

  // Filtering (full — applies status filter on top of baseFiltered)
  const filtered = baseFiltered.filter((l) => {
    if (statusFilter && l.status !== statusFilter) return false;
    return true;
  });

  // Sorting
  const sorted = [...filtered].sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (sortCol === 'cartValue') { va = va || 0; vb = vb || 0; return sortDir === 'asc' ? va - vb : vb - va; }
    if (va == null) va = ''; if (vb == null) vb = '';
    if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (col) => {
    if (sortCol === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const filteredTotal = filtered.reduce((s, l) => s + (l.cartValue || 0), 0);

  // Lead CRUD
  const saveLead = (formData) => {
    setLeads((prev) => {
      const idx = prev.findIndex((l) => l.id === formData.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = formData; return next; }
      return [...prev, formData];
    });
    setDrawerLead(null);
    setShowAddDrawer(false);
  };

  const removeLead = (id) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setDeleteLead(null);
  };

  const updateStatus = (id, newStatus, lostReason) => {
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status: newStatus, lostReason: newStatus === 'Order Lost' ? lostReason : '' } : l));
  };

  const addRemark = (leadId, remark) => {
    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, remarks: [...(l.remarks || []), remark] } : l));
  };

  const today = todayStr();

  const isOverdue = (l) => l.followUpDate && l.followUpDate < today && !['Delivered', 'Refunded', 'Order Lost'].includes(l.status);

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAFA' }}>
      {/* Header */}
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>material</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#EAB308', marginLeft: -10 }}>depot</span>
          <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 8 }}>Sales CRM</span>
        </div>
      </header>

      <div style={{ padding: '16px 24px' }}>
        {/* Pipeline Revenue Summary */}
        <div style={S.pipelineCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF' }}>Total Pipeline Value</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, color: '#000' }}>{fmtINR(pipelineTotal)}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>{leads.length} leads</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF' }}>Active Pipeline</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: '#EAB308' }}>{fmtINR(pipelineActive)}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>{activeCount} leads</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF' }}>Won</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: '#15803D' }}>{fmtINR(pipelineWon)}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>{wonCount} leads</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF' }}>Lost / Refunded</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: '#9CA3AF' }}>{fmtINR(pipelineLost)}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>{lostCount} leads</div>
            </div>
          </div>
          {/* Stacked bar */}
          <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 16, background: '#E5E7EB' }}>
            <div style={{ width: pctWon + '%', background: '#22C55E', transition: 'width 0.3s' }} />
            <div style={{ width: pctActive + '%', background: '#EAB308', transition: 'width 0.3s' }} />
            <div style={{ width: pctLost + '%', background: '#9CA3AF', transition: 'width 0.3s' }} />
          </div>
          {/* Per-status chips */}
          {statusChips.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {statusChips.map((sc) => (
                <span
                  key={sc.status}
                  onClick={() => setStatusFilter((f) => f === sc.status ? '' : sc.status)}
                  style={{
                    ...S.chip,
                    border: statusFilter === sc.status ? '1px solid #EAB308' : '1px solid #E5E7EB',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[sc.status], marginRight: 6 }} />
                  <span style={{ fontSize: 11 }}>{sc.status}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, marginLeft: 6 }}>{fmtINR(sc.value)}</span>
                  <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 4 }}>({sc.count})</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Stage Cards */}
        <div style={{ display: 'flex', gap: 12, marginTop: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {stageSummary.map((ss) => {
            const active = statusFilter === ss.status;
            return (
              <div
                key={ss.status}
                onClick={() => setStatusFilter((f) => f === ss.status ? '' : ss.status)}
                style={{
                  ...S.stageCard,
                  borderColor: active ? '#EAB308' : '#E5E7EB',
                  cursor: 'pointer',
                  flex: '1 0 140px',
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 700, color: active ? '#EAB308' : '#374151' }}>{ss.count}</div>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF', marginTop: 2 }}>{ss.status}</div>
                {ss.value > 0 && (
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: STATUS_COLORS[ss.status], marginTop: 4 }}>{fmtINR(ss.value)}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Toolbar */}
        <div style={S.toolbar}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
            <input
              style={{ ...S.input, width: 220 }}
              placeholder="Search leads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select style={{ ...S.input, width: 200 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select style={{ ...S.input, width: 180 }} value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
              <option value="">All Salespeople</option>
              {SALES_PEOPLE.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select style={{ ...S.input, width: 150 }} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="">All Branches</option>
              {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', marginLeft: 4 }}>FROM</span>
            <input style={{ ...S.input, width: 140 }} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF' }}>TO</span>
            <input style={{ ...S.input, width: 140 }} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            {(dateFrom || dateTo) && <button style={{ ...S.cancelBtn, padding: '6px 10px', fontSize: 11 }} onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear Dates</button>}
            <span style={{ fontSize: 12, color: '#6B7280' }}>{filtered.length} lead{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          <button style={S.primaryBtn} onClick={() => setShowAddDrawer(true)}>+ Add Lead</button>
        </div>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#FAFAFA' }}>
                  <Th label="Lead ID" sortKey="id" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Date Added" sortKey="createdAt" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Assigned To" sortKey="assignedTo" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Branch" sortKey="branch" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Status" sortKey="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Cart Items" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Follow-up" sortKey="followUpDate" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Closure Date" sortKey="closureDate" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Cart Value" sortKey="cartValue" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ textAlign: 'right' }} />
                  <Th label="Actions" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ textAlign: 'center' }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((l) => (
                  <tr
                    key={l.id}
                    style={{ borderTop: '1px solid #E5E7EB' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#FFFAF7'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; }}
                  >
                    <td style={S.td}>
                      <span style={S.leadIdChip}>{l.id}</span>
                    </td>
                    <td style={{ ...S.td, color: '#6B7280', fontSize: 12 }}>{fmtDate(l.createdAt)}</td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Avatar name={l.assignedTo} />
                        <span style={{ fontSize: 12 }}>{l.assignedTo}</span>
                      </div>
                    </td>
                    <td style={{ ...S.td, fontSize: 12 }}>{l.branch || '\u2014'}</td>
                    <td style={S.td}>
                      <EditableStatus status={l.status} lostReason={l.lostReason} onCommit={(s, reason) => updateStatus(l.id, s, reason)} />
                    </td>
                    <td style={{ ...S.td, fontSize: 12, maxWidth: 160 }}>
                      {(l.cartItems || []).slice(0, 2).map((it, i) => (
                        <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {it.name} x{it.qty}
                        </div>
                      ))}
                      {(l.cartItems || []).length > 2 && <span style={{ color: '#9CA3AF', fontSize: 11 }}>+{l.cartItems.length - 2} more</span>}
                    </td>
                    <td style={S.td}>
                      {l.followUpDate ? (
                        <span style={{ fontWeight: isOverdue(l) ? 700 : 400, color: isOverdue(l) ? '#EF4444' : '#374151', fontSize: 12 }}>
                          {isOverdue(l) && '\u26A0 '}{fmtDate(l.followUpDate)}
                        </span>
                      ) : '\u2014'}
                    </td>
                    <td style={{ ...S.td, fontSize: 12, color: '#6B7280' }}>{fmtDate(l.closureDate)}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13 }}>
                      {fmtINR(l.cartValue)}
                    </td>
                    <td style={{ ...S.td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button style={S.actionBtn} title="Edit" onClick={() => setDrawerLead(l)}>
                        Edit
                        {(l.remarks || []).length > 0 && <span style={S.remarksBadge}>{l.remarks.length}</span>}
                      </button>
                      <button style={{ ...S.actionBtn, color: '#EF4444' }} title="Delete" onClick={() => setDeleteLead(l)}>{'\u2715'}</button>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No leads found</td></tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#FFF7F0' }}>
                    <td colSpan={8} style={{ ...S.td, fontWeight: 600, fontSize: 12 }}>Total ({filtered.length} lead{filtered.length !== 1 ? 's' : ''})</td>
                    <td style={{ ...S.td, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: '#EAB308' }}>{fmtINR(filteredTotal)}</td>
                    <td style={S.td} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Drawer */}
      {(showAddDrawer || drawerLead) && (
        <LeadDrawer
          lead={drawerLead}
          onSave={saveLead}
          onClose={() => { setDrawerLead(null); setShowAddDrawer(false); }}
          onAddRemark={drawerLead ? (remark) => addRemark(drawerLead.id, remark) : undefined}
        />
      )}
      {deleteLead && (
        <DeleteConfirm
          leadId={deleteLead.id}
          onConfirm={() => removeLead(deleteLead.id)}
          onCancel={() => setDeleteLead(null)}
        />
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const S = {
  header: {
    position: 'sticky', top: 0, zIndex: 900, height: 48, background: '#1A1A1A',
    display: 'flex', alignItems: 'center', padding: '0 24px',
  },
  pipelineCard: {
    background: '#fff', borderRadius: 8, padding: '16px 24px', border: '1px solid #E5E7EB',
  },
  stageCard: {
    background: '#fff', borderRadius: 8, padding: '12px 16px', border: '1.5px solid #E5E7EB',
    textAlign: 'center', minWidth: 130,
  },
  toolbar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 0', gap: 12, flexWrap: 'wrap',
  },
  th: {
    padding: '10px 12px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.06em', color: '#9CA3AF', textAlign: 'left', whiteSpace: 'nowrap',
    userSelect: 'none',
  },
  td: {
    padding: '10px 12px', fontSize: 13, verticalAlign: 'middle',
  },
  leadIdChip: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
    background: '#F3F4F6', padding: '2px 8px', borderRadius: 4,
  },
  statusBadge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: 12,
    fontSize: 11, fontWeight: 600, border: '1px solid', whiteSpace: 'nowrap',
  },
  statusSelect: {
    padding: '4px 8px', fontSize: 12, border: '1px solid #E5E7EB', borderRadius: 6,
    outline: 'none',
  },
  avatar: {
    background: '#EAB308', color: '#fff', borderRadius: '50%', display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center', fontWeight: 600, flexShrink: 0,
  },
  input: {
    padding: '8px 10px', fontSize: 13, border: '1px solid #E5E7EB', borderRadius: 6,
    outline: 'none', fontFamily: "'Inter', sans-serif",
  },
  field: { marginBottom: 12 },
  fieldLabel: {
    display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.06em', color: '#9CA3AF', marginBottom: 4,
  },
  formGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px',
  },
  formGridDrawer: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px',
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modalBox: {
    background: '#fff', borderRadius: 8, overflow: 'hidden', width: '90%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  modalHeader: {
    background: '#1A1A1A', color: '#fff', padding: '12px 20px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  closeBtn: {
    background: 'none', border: 'none', color: '#9CA3AF', fontSize: 20, cursor: 'pointer',
    lineHeight: 1,
  },
  primaryBtn: {
    background: '#EAB308', color: '#fff', border: 'none', padding: '8px 20px',
    borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  cancelBtn: {
    background: '#fff', color: '#374151', border: '1px solid #E5E7EB', padding: '8px 20px',
    borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
  },
  removeBtn: {
    background: 'none', border: 'none', color: '#EF4444', fontSize: 18, cursor: 'pointer',
    width: 28, lineHeight: 1,
  },
  addItemLink: {
    color: '#EAB308', fontSize: 12, fontWeight: 600, background: 'none', border: 'none',
  },
  actionBtn: {
    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
    fontSize: 13, color: '#374151', position: 'relative',
  },
  remarksBadge: {
    position: 'absolute', top: -2, right: -4, background: '#EAB308', color: '#fff',
    fontSize: 9, fontWeight: 700, borderRadius: '50%', width: 16, height: 16,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  chip: {
    display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 16,
    background: '#fff', fontSize: 11,
  },
  drawerBackdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 900,
  },
  drawer: {
    position: 'fixed', top: 0, right: 0, width: 480, height: '100vh', background: '#fff',
    zIndex: 901, display: 'flex', flexDirection: 'column',
    boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
    animation: 'slideInRight 0.25s ease-out',
  },
  drawerHeader: {
    background: '#1A1A1A', padding: '12px 16px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  drawerSectionTitle: {
    fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
    color: '#374151', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #F3F4F6',
  },
  remarkBubble: {
    background: '#FAFAFA', padding: '8px 12px', borderRadius: 8, fontSize: 13,
    lineHeight: 1.5, border: '1px solid #E5E7EB',
  },
};
