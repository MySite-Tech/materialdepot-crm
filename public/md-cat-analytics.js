/* Material Depot — CATEGORY & COMMERCIAL ANALYTICS registry, data layer and renderers.

   Loaded from /md-cat-analytics.js by components/site-audit/catAnalytics.ts (see that file for
   the loader) and consumed by CatAnalyticsPanel.tsx. Ported here VERBATIM from the
   material-depot-site Admin console so the two dashboards can never drift apart: it is pure data
   + functions + string-returning renderers — no Supabase, no DOM reads, no React, no jsPDF — so
   the exact same file runs unmodified in both apps. Keep it that way: fix it in one repo, copy it
   to the other, do not fork it.

   ─────────────────────────────────────────────────────────────────────────────────────────
   WHAT THIS FILE IS FOR
   The Admin → Analytics tab has two halves with two different sources:
     • EXECUTION (bookings, executions, TAT, arrival on time, NPS)  → the real ops DB
       (audit_orders / install_orders / ratings in Supabase). Lives in Admin.html, not here.
     • COMMERCIAL (carts, cart conversion, orders, order value, attach rate, audit→order
       conversion, store penetration, targets) → the ORDER BOOK, which lives in the
       materialdepot_azure Postgres and is reached through Metabase. That is THIS file.
   The two must never be mixed in one number: an order lives in Metabase, a site visit lives
   in Supabase, and the only bridge between them is the customer phone number.

   ─────────────────────────────────────────────────────────────────────────────────────────
   DUMMY DATA — WHY IT LOOKS REAL
   MD_AN_SOURCE.mode is 'dummy'. The generator below is seeded with the ACTUAL Jun–Aug 2026
   figures from `MD_Category_Analysis_JunAug_2026.xlsx` (prepared 17 Aug 2026 off Metabase
   db 5) and expands them into order-level and cart-level rows that ADD BACK UP to those
   figures exactly — so every card, table and CSV on screen is arithmetically the same number
   the workbook reports, just sliceable by day/week/store. `node tools/an_reconcile.js`
   asserts that (see MD_AN_SHEET below for the embedded source figures).

   TO GO LIVE ON METABASE: implement MD_AN_SOURCE.metabase() to return the SAME shape
   MD_AN_SOURCE.dummy() returns (documented at MD_AN_ROW_CONTRACT) and flip `mode`.
   Nothing else in this file or in Admin.html needs to change.
   ───────────────────────────────────────────────────────────────────────────────────────── */
(function(){
'use strict';

/* ══════════════════════════════════════════════════════════════════════════════════════════
   1. CATEGORY REGISTRY  —  add a category by adding ONE entry here.
   Every card, table, weekly row, penetration column, target row and CSV column iterates this
   object, so a new category needs zero other code changes (same contract as MD_CATEGORIES in
   md-audit-registry.js). Keys deliberately match md-audit-registry.js where they overlap
   (flooring / wallpaper / wallpanel / cnc) so a job-card category and an analytics category
   are the same string everywhere in the codebase.
     kind:     'service' = we sell the visit (audit, installation). 'product' = we sell material.
     attach:   true  → an installation attach rate is meaningful for this category.
     audited:  true  → this category is what a site audit converts INTO.
     aov:      ₹/order, Jun–Aug 2026 actual. Seeds revenue targets; editable in the Targets tab.
     modelled: true  → NOT in the source workbook; its figures are invented but plausible and
               are badged as modelled everywhere they appear. Delete the flag the day the
               Metabase query starts returning the category for real.
   ══════════════════════════════════════════════════════════════════════════════════════════ */
window.MD_AN_CATEGORIES={
  site_audit:  {id:'site_audit',  label:'Site Audit',       short:'Audit',  icon:'🔍', kind:'service', attach:false, audited:false, aov:998.94,   qtyUnit:'visits', color:'#2E6CA8', ord:1,
                note:'Own category only from 31 Jul 2026 — before that these items sat inside Installation, so every ₹999-multiple Installation line in Jun/Jul is counted here (validated in the workbook: Jun 78 handle-matched vs 77 price-matched items, Jul 174 vs 174).'},
  installation:{id:'installation',label:'Site Installation',short:'Install',icon:'🔧', kind:'service', attach:false, audited:false, aov:4850.35,  qtyUnit:'sq.ft',  color:'#0f6e74', ord:2,
                note:'Excludes site-audit items, so Site Audit and Site Installation never double-count.'},
  wallpaper:   {id:'wallpaper',   label:'Wallpaper',        short:'WP',     icon:'🎨', kind:'product', attach:true,  audited:true,  aov:13861.33, qtyUnit:'rolls',  color:'#5b3aa6', ord:3},
  flooring:    {id:'flooring',    label:'Wooden Flooring',  short:'WF',     icon:'🪵', kind:'product', attach:true,  audited:true,  aov:51279.87, qtyUnit:'sq.ft',  color:'#9a6200', ord:4,
                note:'Composite, SPC, Engineered, Laminate, Vinyl, Solid Wood and Carpet flooring.'},
  wallpanel:   {id:'wallpanel',   label:'Wall Panels',      short:'Panels', icon:'🧱', kind:'product', attach:true,  audited:true,  aov:18400,    qtyUnit:'sq.ft',  color:'#1f7a3f', ord:5, modelled:true},
  cnc:         {id:'cnc',         label:'CNC',              short:'CNC',    icon:'🪚', kind:'product', attach:true,  audited:true,  aov:26500,    qtyUnit:'sq.ft',  color:'#8a5a2b', ord:6, modelled:true}
};
window.MD_AN_CAT_IDS=Object.keys(window.MD_AN_CATEGORIES).sort(function(a,b){return window.MD_AN_CATEGORIES[a].ord-window.MD_AN_CATEGORIES[b].ord;});

/* ══════════════════════════════════════════════════════════════════════════════════════════
   2. STORE REGISTER  —  from the workbook's Store Maturity + Sheet1 STEP 1 tabs.
   `kind`: 'store' = retail experience centre, 'channel' = B2B / HQ (not a store; excluded from
   store-benchmark and target-warning logic unless a target is set by hand).
   `status`: 'mature' | 'ramping' | 'planned' | 'channel'. `archetype` = the mature store a
   ramping/planned store is modelled on (drives the seeded Sep–Dec targets).
   ══════════════════════════════════════════════════════════════════════════════════════════ */
window.MD_AN_STORES={
  'JP NAGAR':          {label:'JP Nagar',           city:'Bengaluru', kind:'store',   status:'mature',  opened:'2023-04-04', archetype:null,        ord:1},
  'WHITEFIELD':        {label:'Whitefield',         city:'Bengaluru', kind:'store',   status:'mature',  opened:'2025-08-11', archetype:null,        ord:2},
  'YELAHANKA':         {label:'Yelahanka',          city:'Bengaluru', kind:'store',   status:'mature',  opened:'2025-05-10', archetype:null,        ord:3},
  'GACHIBOWLI':        {label:'Gachibowli',         city:'Hyderabad', kind:'store',   status:'ramping', opened:'2026-01-07', archetype:'WHITEFIELD',ord:4},
  'KOMPALLY':          {label:'Kompally',           city:'Hyderabad', kind:'store',   status:'ramping', opened:'2026-07-08', archetype:'WHITEFIELD',ord:5},
  'HSR LAYOUT':        {label:'HSR Layout',         city:'Bengaluru', kind:'store',   status:'ramping', opened:'2026-07-27', archetype:'YELAHANKA', ord:6},
  'RR NAGAR':          {label:'RR Nagar',           city:'Bengaluru', kind:'store',   status:'planned', opened:'2026-09-01', archetype:'YELAHANKA', ord:7},
  'ELECTRONIC CITY':   {label:'Electronic City',    city:'Bengaluru', kind:'store',   status:'planned', opened:'2026-09-01', archetype:'YELAHANKA', ord:8},
  'BASAVESHWARA NAGAR':{label:'Basaveshwara Nagar', city:'Bengaluru', kind:'store',   status:'planned', opened:'2026-10-01', archetype:'YELAHANKA', ord:9},
  'INDIRANAGAR':       {label:'Indiranagar',        city:'Bengaluru', kind:'store',   status:'planned', opened:'2026-10-01', archetype:'YELAHANKA', ord:10},
  'CHHABARIA':         {label:'Chhabaria',          city:'Bengaluru', kind:'store',   status:'planned', opened:'2026-11-01', archetype:'YELAHANKA', ord:11},
  'B2B':               {label:'B2B',                city:'Bengaluru', kind:'channel', status:'channel', opened:'2026-07-01', archetype:null,        ord:12},
  'HQ':                {label:'HQ',                 city:'Bengaluru', kind:'channel', status:'channel', opened:'2025-05-14', archetype:null,        ord:13}
};
window.MD_AN_STORE_IDS=Object.keys(window.MD_AN_STORES).sort(function(a,b){return window.MD_AN_STORES[a].ord-window.MD_AN_STORES[b].ord;});
window.mdAnStoreLabel=function(s){var st=window.MD_AN_STORES[s];return st?st.label:s;};

/* ══════════════════════════════════════════════════════════════════════════════════════════
   3. THE WORKBOOK FIGURES  (source of truth for the dummy generator; delete when live)
   Months are the three the workbook covers. Aug 2026 is MONTH-TO-DATE, 1–17 of 31 days —
   every August number here is 17 days, never a full month. `runRateX` is what the workbook
   uses to gross August up for comparison (31/17 = 1.8235).
   ══════════════════════════════════════════════════════════════════════════════════════════ */
window.MD_AN_MONTHS=[
  {m:'2026-06', label:'Jun-26', days:30, dataDays:30, partial:false},
  {m:'2026-07', label:'Jul-26', days:31, dataDays:31, partial:false},
  {m:'2026-08', label:'Aug-26', days:31, dataDays:17, partial:true}
];
window.MD_AN_DATA_FROM='2026-06-01';
window.MD_AN_DATA_TO='2026-08-17';

var SHEET={
  /* Cat × Store × Month — [store, month, orders, value(₹, that category's net line value incl. tax), quantity, customers] */
  cat:{
    site_audit:[
      ['B2B','2026-07',5,4995,5,4],['GACHIBOWLI','2026-08',7,6993,7,7],
      ['HQ','2026-06',1,999,1,1],['HQ','2026-07',1,999,1,1],['HQ','2026-08',1,999,1,1],
      ['HSR LAYOUT','2026-07',3,2997,3,3],['HSR LAYOUT','2026-08',5,4995,5,5],
      ['JP NAGAR','2026-06',13,12987,13,13],['JP NAGAR','2026-07',51,50949,51,50],['JP NAGAR','2026-08',29,28961,29,29],
      ['KOMPALLY','2026-08',5,4995,5,5],
      ['WHITEFIELD','2026-06',19,18987,19,19],['WHITEFIELD','2026-07',38,37962,38,38],['WHITEFIELD','2026-08',16,15974,16,16],
      ['YELAHANKA','2026-06',21,20979,21,21],['YELAHANKA','2026-07',23,22977,23,23],['YELAHANKA','2026-08',10,9990,10,10]
    ],
    installation:[
      ['B2B','2026-07',6,15189,377,6],['B2B','2026-08',4,76663,4930,4],
      ['GACHIBOWLI','2026-08',5,10115,97,5],
      ['HQ','2026-06',4,24976,1245,4],['HQ','2026-07',2,1955,85,2],['HQ','2026-08',1,4720,236,1],
      ['HSR LAYOUT','2026-07',1,5394,6,1],['HSR LAYOUT','2026-08',6,24478,725,6],
      ['JP NAGAR','2026-06',26,109607,4613,26],['JP NAGAR','2026-07',43,187774,6893,42],['JP NAGAR','2026-08',30,136185,4779,26],
      ['KOMPALLY','2026-08',4,16337,139,4],
      ['WHITEFIELD','2026-06',42,243809,7390,39],['WHITEFIELD','2026-07',59,270420,6462,56],['WHITEFIELD','2026-08',23,115876,2915,22],
      ['YELAHANKA','2026-06',18,94108,2664,17],['YELAHANKA','2026-07',20,97804,2407,19],['YELAHANKA','2026-08',15,63347,1547,14]
    ],
    wallpaper:[
      ['B2B','2026-07',7,63332,204,6],['B2B','2026-08',2,31172,160,2],
      ['GACHIBOWLI','2026-06',10,85961,315,9],['GACHIBOWLI','2026-07',7,52172,159,7],['GACHIBOWLI','2026-08',13,134111,258,12],
      ['HQ','2026-06',12,293198,1151,10],['HQ','2026-07',6,82865,225,5],['HQ','2026-08',5,36758,134,4],
      ['HSR LAYOUT','2026-07',2,30463,7,2],['HSR LAYOUT','2026-08',11,113173,382,11],
      ['JP NAGAR','2026-06',47,442457,1186,45],['JP NAGAR','2026-07',56,769753,2172,52],['JP NAGAR','2026-08',34,298072,866,29],
      ['KOMPALLY','2026-07',1,81908,22,1],['KOMPALLY','2026-08',8,149167,277,8],
      ['WHITEFIELD','2026-06',67,906510,2162,63],['WHITEFIELD','2026-07',47,729969,2080,44],['WHITEFIELD','2026-08',27,384032,1197,27],
      ['YELAHANKA','2026-06',24,399014,1078,21],['YELAHANKA','2026-07',21,494852,1208,18],['YELAHANKA','2026-08',21,353711,724,20]
    ],
    flooring:[
      ['B2B','2026-07',5,534292,52,4],['B2B','2026-08',3,475953,92,3],
      ['GACHIBOWLI','2026-06',1,79072,14,1],['GACHIBOWLI','2026-07',2,300563,59,2],['GACHIBOWLI','2026-08',2,25138,6,2],
      ['HQ','2026-06',4,91674,43,4],['HQ','2026-07',1,819,0.1,1],['HQ','2026-08',2,122971,35,2],
      ['HSR LAYOUT','2026-08',1,51021,15,1],
      ['JP NAGAR','2026-06',16,725502,182,16],['JP NAGAR','2026-07',19,816773,203,17],['JP NAGAR','2026-08',11,401445,104,11],
      ['WHITEFIELD','2026-06',10,591722,190.1,7],['WHITEFIELD','2026-07',23,849149,186,20],['WHITEFIELD','2026-08',8,602605,76,6],
      ['YELAHANKA','2026-06',8,608249,122,7],['YELAHANKA','2026-07',10,296846,79,9],['YELAHANKA','2026-08',5,143869,36,5]
    ],
    /* MODELLED — not in the workbook. Wall Panels and CNC are live job-card categories
       (md-audit-registry.js) whose order data the Metabase question does not split out yet. */
    wallpanel:[
      ['JP NAGAR','2026-06',5,88200,214,5],['JP NAGAR','2026-07',7,131600,318,7],['JP NAGAR','2026-08',6,109900,266,6],
      ['WHITEFIELD','2026-06',4,71400,173,4],['WHITEFIELD','2026-07',6,112200,272,6],['WHITEFIELD','2026-08',4,74800,181,4],
      ['YELAHANKA','2026-06',3,53400,129,3],['YELAHANKA','2026-07',3,54600,132,3],['YELAHANKA','2026-08',3,56100,136,3],
      ['GACHIBOWLI','2026-07',1,17600,43,1],['GACHIBOWLI','2026-08',2,37400,91,2],
      ['HSR LAYOUT','2026-08',2,35200,85,2],['KOMPALLY','2026-08',1,19100,46,1],
      ['HQ','2026-06',1,20400,49,1],['B2B','2026-08',1,22300,54,1]
    ],
    cnc:[
      ['JP NAGAR','2026-06',2,51000,86,2],['JP NAGAR','2026-07',3,80700,136,3],['JP NAGAR','2026-08',2,54200,91,2],
      ['WHITEFIELD','2026-06',2,52400,88,2],['WHITEFIELD','2026-07',2,53800,90,2],['WHITEFIELD','2026-08',1,27300,46,1],
      ['YELAHANKA','2026-07',1,26100,44,1],['YELAHANKA','2026-08',1,28400,48,1],
      ['GACHIBOWLI','2026-08',1,25600,43,1],['HQ','2026-07',1,24900,42,1]
    ]
  },
  /* Attach Rate tab — [store, month, wallpaperOrdersWithInstallation, flooringOrdersWithInstallation].
     The workbook checked 'any installation' and 'category-matched installation' and got identical
     counts in every store-month, i.e. nobody buys wallpaper and books flooring installation. */
  attach:[
    ['B2B','2026-07',3,1],['B2B','2026-08',2,2],
    ['GACHIBOWLI','2026-06',0,0],['GACHIBOWLI','2026-07',0,0],['GACHIBOWLI','2026-08',5,0],
    ['HQ','2026-06',0,1],['HQ','2026-07',2,0],['HQ','2026-08',0,0],
    ['HSR LAYOUT','2026-07',1,0],['HSR LAYOUT','2026-08',5,1],
    ['JP NAGAR','2026-06',13,8],['JP NAGAR','2026-07',29,9],['JP NAGAR','2026-08',19,7],
    ['KOMPALLY','2026-07',0,0],['KOMPALLY','2026-08',3,0],
    ['WHITEFIELD','2026-06',27,4],['WHITEFIELD','2026-07',37,17],['WHITEFIELD','2026-08',16,5],
    ['YELAHANKA','2026-06',13,4],['YELAHANKA','2026-07',13,6],['YELAHANKA','2026-08',13,3]
  ],
  /* MODELLED attach for the two modelled categories — [store, month, wallpanelWith, cncWith] */
  attachX:[
    ['JP NAGAR','2026-06',3,1],['JP NAGAR','2026-07',5,2],['JP NAGAR','2026-08',4,1],
    ['WHITEFIELD','2026-06',2,1],['WHITEFIELD','2026-07',4,1],['WHITEFIELD','2026-08',3,1],
    ['YELAHANKA','2026-06',2,0],['YELAHANKA','2026-07',2,1],['YELAHANKA','2026-08',2,1],
    ['GACHIBOWLI','2026-07',0,0],['GACHIBOWLI','2026-08',1,0],
    ['HSR LAYOUT','2026-08',1,0],['KOMPALLY','2026-08',1,0],['HQ','2026-06',0,0],['B2B','2026-08',1,0]
  ],
  /* Cart Funnel tab (company-wide; cart_log has NO branch column — see MD_AN_LIMITS) —
     [month, carts, cartsClearedByAnOrder, cartsThatOrderedSameCategory] */
  carts:{
    site_audit:  [['2026-06',79,63,54],['2026-07',159,126,118],['2026-08',101,79,72]],
    installation:[['2026-06',179,120,86],['2026-07',246,179,126],['2026-08',216,121,77]],
    wallpaper:   [['2026-06',911,312,150],['2026-07',975,284,136],['2026-08',770,230,110]],
    flooring:    [['2026-06',298,103,35],['2026-07',311,115,54],['2026-08',221,77,29]],
    /* MODELLED */
    wallpanel:   [['2026-06',96,34,13],['2026-07',118,41,16],['2026-08',104,36,15]],
    cnc:         [['2026-06',58,19,4],['2026-07',71,26,7],['2026-08',49,17,4]]
  },
  /* Aug Weekly tab — W1 = 1–7, W2 = 8–14, W3 = 15–17 (3 days ONLY).
     augWeekShape = distinct carts per week; augWeekOrders = confirmed orders per week. Both are
     used as the WITHIN-MONTH shape, so the Week-on-Week tab reproduces the workbook's own profile
     instead of a flat weekday spread (August orders really did cluster in W2, and W3's low count
     is a 3-day window whose carts had 0–2 days to convert before the 17 Aug data cut).
     wallpanel / cnc shapes are modelled, like the rest of those two categories. */
  augWeekShape:{
    site_audit:[31,43,29], installation:[88,99,43], wallpaper:[328,370,190], flooring:[88,118,44],
    wallpanel:[38,44,22], cnc:[19,21,9]
  },
  augWeekOrders:{
    site_audit:[20,32,21], installation:[37,44,7], wallpaper:[46,66,9], flooring:[18,11,3],
    wallpanel:[7,8,4], cnc:[2,2,1]
  },
  /* Store Maturity tab — total confirmed orders per store-month, ALL categories.
     Denominator for category penetration. [store]:{month:total} */
  storeTotals:{
    'JP NAGAR':{'2026-06':905,'2026-07':1000,'2026-08':459},
    'WHITEFIELD':{'2026-06':516,'2026-07':621,'2026-08':293},
    'YELAHANKA':{'2026-06':380,'2026-07':404,'2026-08':202},
    'GACHIBOWLI':{'2026-06':349,'2026-07':362,'2026-08':253},
    'HQ':{'2026-06':330,'2026-07':123,'2026-08':68},
    'B2B':{'2026-06':0,'2026-07':210,'2026-08':126},
    'KOMPALLY':{'2026-06':0,'2026-07':81,'2026-08':94},
    'HSR LAYOUT':{'2026-06':0,'2026-07':22,'2026-08':94}
  },
  /* Untagged orders the workbook excluded from the store tables (no branch_id) — surfaced in the
     footer rather than silently dropped: 2 wallpaper Jun, 1 wallpaper Jul, 1 flooring Jul. */
  untagged:[['wallpaper','2026-06',2,5567],['wallpaper','2026-07',1,1999],['flooring','2026-07',1,28665]]
};
window.MD_AN_SHEET=SHEET;

/* Known limits carried over from the workbook's Read Me — shown in the UI, never hidden. */
window.MD_AN_LIMITS={
  cartStore:'cart_log has no branch column, so the workbook reports carts company-wide only. Attribution via cart.assigned_to_id puts 97% of August carts on “HQ” (that field holds the procurement owner, not the store rep) and attribution via the customer’s ordering branch resolves only ~36% of carts. Store-level cart figures here are therefore ALLOCATED pro-rata on each store’s share of that category’s orders in the month — directional, not measured. Adding branch_id to cart / cart_log is the single biggest gap in this analysis.',
  augPartial:'August 2026 is month-to-date: 17 of 31 days. Never compare a raw August total against a full Jun/Jul month — use the per-day columns or the ×1.82 run-rate.',
  auditCategory:'Site Audit became its own category on 31 Jul 2026. Jun/Jul site audits are recovered from ₹999-multiple Installation lines, and Installation excludes them, so the two never double-count.',
  attachIdentical:'Attach rate was checked both ways — “any installation” and “category-matched installation” — and the two are identical in every store-month, so one number is reported.',
  testAccounts:'4 internal client_ids are excluded, matching the convention in the existing Sales Rep Analytics questions.'
};

/* ══════════════════════════════════════════════════════════════════════════════════════════
   4. ROW CONTRACT  —  the ONLY thing a live Metabase implementation has to reproduce.
   ══════════════════════════════════════════════════════════════════════════════════════════
   MD_AN_SOURCE.fetch() must resolve to:
   {
     meta:  {mode, from, to, generatedAt, note},
     orders:[{ id, date:'YYYY-MM-DD', month:'YYYY-MM', store, city, client,   // client = phone
                lines:[{cat, value, qty}],                                    // one per category
                hasInstall:Boolean }],                       // does the order contain an install line
     carts: [{ id, cat, store, city, date, month, client,
                cleared:Boolean,          // fired order_placed_cart_cleared in the period  (conv A)
                orderedSameCat:Boolean }],// customer placed a confirmed order in THIS category (conv B)
     storeTotals:{store:{month:totalConfirmedOrdersAllCategories}}  // penetration denominator
   }
   Definitions to keep byte-identical to the workbook and to the existing Sales Rep Analytics
   dashboard, so numbers never diverge between the two:
     order        estimate rows with is_deleted=FALSE, is_revised=FALSE and estimate_status in
                  (order_confirmed, order_placed, shipped, partly_shipped, partly_delivered,
                  delivered). Quotes, lost and cancelled excluded.
     order date   COALESCE(order_placed_time, created_at)
     store        estimate.branch_id → organisation_branch.branch_name
     order count  DISTINCT orders containing ≥1 item of the category (an order with wallpaper +
                  flooring counts in BOTH — that is deliberate, it is not double counting revenue)
     order value  SUM(estimate_items.total_price - total_discount) for that category's items only
     quantity     SUM(estimate_items.quantity)
     customers    DISTINCT estimate.client_id
     site audit   variant_handle LIKE '%site-audit%' OR category_name='Site Audit'  (the handle
                  rule also catches the ₹1,005 Quartz site audit, which a flat ₹999 rule misses)
     installation category_name='Installation' EXCLUDING site-audit items
     cart         one distinct cart_number active in the period holding ≥1 item of that category
                  (cart_log ⋈ variant → product → category)
   ══════════════════════════════════════════════════════════════════════════════════════════ */

/* ---- deterministic PRNG (same seed ⇒ same dashboard every reload; no Math.random anywhere) ---- */
function hash32(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function rngFor(seed){var a=hash32(String(seed));return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

/* ---- date helpers (all local-date arithmetic; never toISOString, which is UTC) ---- */
function pad2(n){return n<10?'0'+n:''+n;}
function dstr(y,m,d){return y+'-'+pad2(m)+'-'+pad2(d);}
function monthDays(mkey){var y=+mkey.slice(0,4),m=+mkey.slice(5,7);return new Date(y,m,0).getDate();}
function monthMeta(mkey){for(var i=0;i<window.MD_AN_MONTHS.length;i++)if(window.MD_AN_MONTHS[i].m===mkey)return window.MD_AN_MONTHS[i];return {m:mkey,label:mkey,days:monthDays(mkey),dataDays:monthDays(mkey),partial:false};}
// Retail weekday shape — weekends carry more walk-in demand than mid-week.
var DOW_W=[1.15,0.85,0.80,0.85,0.95,1.15,1.25]; // Sun..Sat
function monthDayList(mkey){
  var mm=monthMeta(mkey),y=+mkey.slice(0,4),m=+mkey.slice(5,7),out=[];
  for(var d=1;d<=mm.dataDays;d++){var js=new Date(y,m-1,d);out.push({date:dstr(y,m,d),dow:js.getDay(),w:DOW_W[js.getDay()]});}
  return out;
}
window.mdAnMonthOf=function(date){return date?date.slice(0,7):'';};

/* ---- integer split that always sums EXACTLY to `total` ---- */
function splitCount(total,weights,rng){
  var n=weights.length,out=new Array(n).fill(0);
  if(!total||!n)return out;
  var sw=weights.reduce(function(s,w){return s+w;},0)||n;
  var acc=0;
  for(var i=0;i<n;i++){var exact=total*weights[i]/sw;out[i]=Math.floor(exact);acc+=out[i];}
  // hand the remainder out in descending fractional-part order, jittered so it isn't always day 1
  var rem=total-acc;
  var frac=weights.map(function(w,i){return {i:i,f:(total*w/sw)-Math.floor(total*w/sw)+rng()*1e-6};});
  frac.sort(function(a,b){return b.f-a.f;});
  for(var k=0;k<rem;k++)out[frac[k%n].i]++;
  return out;
}
/* ---- value split that always sums EXACTLY to `total` (integers, or 1dp for quantities) ---- */
function splitValue(total,n,rng,dp){
  var out=[],w=[],sw=0,i;
  if(!n)return out;
  for(i=0;i<n;i++){var x=0.55+rng()*1.25;w.push(x);sw+=x;}
  var mul=dp?10:1,tot=Math.round(total*mul),acc=0;
  for(i=0;i<n;i++){var v=i===n-1?tot-acc:Math.round(tot*w[i]/sw);if(v<0)v=0;acc+=v;out.push(v/mul);}
  // last-slot correction can go negative when jitter overshoots; push the excess back one slot
  if(out[n-1]<0){out[n-2]=(out[n-2]||0)+out[n-1];out[n-1]=0;}
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════
   5. DUMMY GENERATOR
   Expands the workbook figures into order-level and cart-level rows that add back up to them.
   Everything invented rather than measured is listed in MD_AN_ASSUMPTIONS and badged in the UI.
   ══════════════════════════════════════════════════════════════════════════════════════════ */
window.MD_AN_ASSUMPTIONS={
  auditConv:'Site audit → order conversion is NOT in the workbook (it needs a phone-level join the Metabase question does not do yet). The dummy set links audits to later orders at a per-store rate of 38–48%, of which ~62% also take installation. The METRIC is computed honestly from those links by phone match — swap in the real join and the same code reports the real number.',
  cartStore:'Carts are allocated to stores pro-rata on each store’s share of that category’s orders in the month (cart_log has no branch column). Company-wide cart totals are the workbook’s real figures.',
  cartWeek:'Weekly cart counts are a proportional split of the month’s distinct-cart total, shaped on the workbook’s own Aug W1/W2/W3 profile. A cart is persistent, so the workbook’s per-week distinct counts sum to slightly more than its monthly distinct count; splitting the month keeps every longer range exact and moves each week by at most one cart.',
  modelledCats:'Wall Panels and CNC order/cart figures are invented. They are real job-card categories but the Metabase category split does not separate them yet.',
  intraMonth:'Day-level dates inside a month are modelled (weekday-weighted), because the workbook is monthly/weekly. Any range that starts and ends on a month boundary is exact; a mid-month range is directional.'
};
// Per-store audit→order conversion rates used by the linker (invented — see MD_AN_ASSUMPTIONS).
var AUDIT_CONV={'JP NAGAR':0.46,'WHITEFIELD':0.48,'YELAHANKA':0.44,'GACHIBOWLI':0.38,'KOMPALLY':0.40,'HSR LAYOUT':0.42,'B2B':0.40,'HQ':0.40};
var AUDIT_CONV_WITH_INSTALL=0.62;

var PRODUCT_CATS=['wallpaper','flooring','wallpanel','cnc'];

/* Day weights for splitting a store-month's count across days. August follows the workbook's own
   W1/W2/W3 profile for that category (shape[] per week, spread inside the week by weekday);
   other months are weekday-shaped only, since the workbook gives no within-month detail. */
function augWeekOf(i){var dom=i+1;return dom<=7?0:dom<=14?1:2;}
/* Splits `total` across the month's days. For August the workbook gives a week profile, so the
   month is split ACROSS WEEKS first and only then across the days inside each week — splitting
   straight to per-day weights would put a store-month's single order in whichever day carried the
   highest rate (always W3), which contradicted the very profile it was meant to reproduce. */
function splitShaped(total,days,month,shape,seed){
  var rng=rngFor(seed);
  if(!(month==='2026-08'&&shape))return splitCount(total,days.map(function(d){return d.w;}),rng);
  var weekTot=splitCount(total,shape.slice(0,3),rng);
  var out=new Array(days.length).fill(0);
  [0,1,2].forEach(function(wk){
    var idx=[];days.forEach(function(d,i){if(augWeekOf(i)===wk)idx.push(i);});
    if(!idx.length)return;
    var sub=splitCount(weekTot[wk],idx.map(function(i){return days[i].w;}),rngFor(seed+'w'+wk));
    idx.forEach(function(i,k){out[i]=sub[k];});
  });
  return out;
}

function sheetIndex(){
  var idx={};
  Object.keys(SHEET.cat).forEach(function(cat){
    idx[cat]={};
    SHEET.cat[cat].forEach(function(r){idx[cat][r[0]+'|'+r[1]]={store:r[0],month:r[1],orders:r[2],value:r[3],qty:r[4],customers:r[5]};});
  });
  return idx;
}
function attachIndex(){
  var idx={};
  SHEET.attach.forEach(function(r){idx[r[0]+'|'+r[1]]=idx[r[0]+'|'+r[1]]||{};idx[r[0]+'|'+r[1]].wallpaper=r[2];idx[r[0]+'|'+r[1]].flooring=r[3];});
  SHEET.attachX.forEach(function(r){idx[r[0]+'|'+r[1]]=idx[r[0]+'|'+r[1]]||{};idx[r[0]+'|'+r[1]].wallpanel=r[2];idx[r[0]+'|'+r[1]].cnc=r[3];});
  return idx;
}

function generate(){
  var IDX=sheetIndex(), ATT=attachIndex();
  var orders=[], carts=[];
  var phoneSeq=6000000, orderSeq=0, cartSeq=0;
  function newPhone(){phoneSeq+=Math.floor(1+rngFor('ph'+phoneSeq)()*7);return '9'+String(phoneSeq).padStart(9,'0');}
  function mkOrder(store,month,date,cat,value,qty){
    orderSeq++;
    return {id:'MD'+month.replace('-','')+'-'+String(orderSeq).padStart(5,'0'),date:date,month:month,
      store:store,city:(window.MD_AN_STORES[store]||{}).city||'Bengaluru',client:null,
      lines:[{cat:cat,value:value,qty:qty}],hasInstall:false,link:null};
  }
  function addLine(o,cat,value,qty){o.lines.push({cat:cat,value:value,qty:qty});if(cat==='installation')o.hasInstall=true;}
  function hasCat(o,cat){for(var i=0;i<o.lines.length;i++)if(o.lines[i].cat===cat)return true;return false;}

  window.MD_AN_MONTHS.forEach(function(mm){
    var month=mm.m, days=monthDayList(month);
    window.MD_AN_STORE_IDS.forEach(function(store){
      var rng=rngFor(store+month+'v1');
      var perCat={}, all=[];

      /* --- site audits: one ₹999-class order each --- */
      var ar=IDX.site_audit[store+'|'+month];
      if(ar){
        var aCounts=splitShaped(ar.orders,days,month,SHEET.augWeekOrders.site_audit,store+month+'a');
        var aVals=splitValue(ar.value,ar.orders,rngFor(store+month+'av'),0);
        var aQty=splitValue(ar.qty,ar.orders,rngFor(store+month+'aq'),1);
        var k=0;perCat.site_audit=[];
        days.forEach(function(d,di){for(var j=0;j<aCounts[di];j++){var o=mkOrder(store,month,d.date,'site_audit',aVals[k],aQty[k]);k++;perCat.site_audit.push(o);all.push(o);}});
      }

      /* --- product categories --- */
      PRODUCT_CATS.forEach(function(cat){
        var r=IDX[cat][store+'|'+month];if(!r)return;
        var counts=splitShaped(r.orders,days,month,SHEET.augWeekOrders[cat],store+month+cat);
        var vals=splitValue(r.value,r.orders,rngFor(store+month+cat+'v'),0);
        var qtys=splitValue(r.qty,r.orders,rngFor(store+month+cat+'q'),1);
        var k=0;perCat[cat]=[];
        days.forEach(function(d,di){for(var j=0;j<counts[di];j++){var o=mkOrder(store,month,d.date,cat,vals[k],qtys[k]);k++;perCat[cat].push(o);all.push(o);}});
      });

      /* --- installation: attached to product orders per the workbook's attach counts, plus
             standalone "other installation" (quartz, tiles, PVC ceiling) to reach the total --- */
      var ir=IDX.installation[store+'|'+month];
      var att=ATT[store+'|'+month]||{};
      var attached=[]; // entities that will carry an installation line
      PRODUCT_CATS.forEach(function(cat){
        var want=att[cat]||0, list=perCat[cat]||[];
        // spread the attached ones through the month instead of taking the first N
        for(var i=0;i<want&&i<list.length;i++){var pick=list[Math.floor(i*list.length/Math.max(1,want))]||list[i];if(attached.indexOf(pick)<0)attached.push(pick);else attached.push(list.filter(function(x){return attached.indexOf(x)<0;})[0]||pick);}
      });
      attached=attached.filter(function(x,i,a){return x&&a.indexOf(x)===i;});
      var installTotal=ir?ir.orders:0;
      // Overlap: when attached-product-orders exceed the month's installation order count, some
      // single order must have carried BOTH (e.g. Yelahanka Aug: 13 WP + 3 WF attached vs 15
      // installation orders ⇒ exactly one order had wallpaper AND flooring installation).
      var overlap=Math.max(0,attached.length-installTotal);
      for(var ov=0;ov<overlap;ov++){
        var a=null,b=null;
        for(var i2=0;i2<attached.length&&!a;i2++){
          for(var j2=i2+1;j2<attached.length;j2++){
            var ca=attached[i2].lines[0].cat, cb=attached[j2].lines[0].cat;
            if(ca!==cb&&attached[i2].lines.length===1&&attached[j2].lines.length===1){a=attached[i2];b=attached[j2];break;}
          }
        }
        if(!a||!b)break;
        b.lines.forEach(function(l){a.lines.push(l);});
        attached.splice(attached.indexOf(b),1);
        all.splice(all.indexOf(b),1);
        Object.keys(perCat).forEach(function(c){var ix=perCat[c].indexOf(b);if(ix>=0)perCat[c][ix]=a;});
      }
      var others=Math.max(0,installTotal-attached.length);
      var otherEnts=[];
      if(others){
        var oc=splitShaped(others,days,month,SHEET.augWeekOrders.installation,store+month+'inst');
        days.forEach(function(d,di){for(var j=0;j<oc[di];j++){var o=mkOrder(store,month,d.date,'installation',0,0);otherEnts.push(o);all.push(o);}});
      }
      var instEnts=attached.concat(otherEnts);
      if(ir&&instEnts.length){
        var iv=splitValue(ir.value,instEnts.length,rngFor(store+month+'iv'),0);
        var iq=splitValue(ir.qty,instEnts.length,rngFor(store+month+'iq'),1);
        instEnts.forEach(function(o,i){
          if(hasCat(o,'installation')){o.lines.forEach(function(l){if(l.cat==='installation'){l.value=iv[i];l.qty=iq[i];}});o.hasInstall=true;}
          else addLine(o,'installation',iv[i],iq[i]);
        });
      }
      perCat.installation=instEnts;

      /* --- customers: exactly `customers` distinct phones per store-month-category.
             Processed in registry order so a merged (2-category) order keeps ONE client and
             still counts toward both categories' distinct totals. --- */
      window.MD_AN_CAT_IDS.forEach(function(cat){
        var r=IDX[cat][store+'|'+month];if(!r)return;
        var ents=(perCat[cat]||[]).filter(function(o){return hasCat(o,cat);});
        var used=[],cRng=rngFor(store+month+cat+'cust');
        // Count phones an earlier category already put on these orders FIRST — a shared order
        // (wallpaper + its installation) must not be allowed to push this category's distinct
        // total past the workbook's own `customers` figure.
        ents.forEach(function(o){if(o.client&&used.indexOf(o.client)<0)used.push(o.client);});
        ents.forEach(function(o){
          if(o.client)return;
          if(used.length<r.customers){o.client=newPhone();used.push(o.client);}
          else o.client=used[Math.floor(cRng()*used.length)];
        });
      });
      all.forEach(function(o){if(!o.client)o.client=newPhone();});
      all.forEach(function(o){if(orders.indexOf(o)<0)orders.push(o);});
    });
  });

  /* --- site audit → order links (invented rate, honest metric — see MD_AN_ASSUMPTIONS) --- */
  var linkedPhones={};
  window.MD_AN_STORE_IDS.forEach(function(store){
    var mine=orders.filter(function(o){return o.store===store;});
    var audits=mine.filter(function(o){return hasCat(o,'site_audit');}).sort(function(a,b){return a.date<b.date?-1:1;});
    var prods=mine.filter(function(o){return o.lines.some(function(l){return PRODUCT_CATS.indexOf(l.cat)>=0;});}).sort(function(a,b){return a.date<b.date?-1:1;});
    if(!audits.length||!prods.length)return;
    var rate=AUDIT_CONV[store]||0.40, K=Math.round(audits.length*rate);
    var rng=rngFor(store+'link'), taken={};
    // A store-month whose audit count exceeds its customer count has one repeat client (e.g. JP
    // Nagar Jul: 51 audits, 50 customers). Linking such an audit would hand it a fresh phone and
    // silently break that store-month's distinct-customer figure, so those audits are left alone.
    var phoneUses={};audits.forEach(function(o){phoneUses[o.client]=(phoneUses[o.client]||0)+1;});
    var step=audits.length/Math.max(1,K);
    for(var i=0;i<K;i++){
      var a=audits[Math.min(audits.length-1,Math.floor(i*step))];
      if(a.link||phoneUses[a.client]>1)continue;
      var wantInstall=rng()<AUDIT_CONV_WITH_INSTALL;
      // A real audit→order gap is days-to-weeks, not "the next order on the list" — draw a lag so
      // the TAT distribution on screen is a distribution rather than a spike at 1 day. The COE
      // follow-up ladder calls at D+1 / D+3 / D+14, which is the shape this mirrors.
      var minLag=2+Math.floor(rng()*26);
      var earliest=new Date(new Date(a.date).getTime()+minLag*86400000);
      var earliestStr=dstr(earliest.getFullYear(),earliest.getMonth()+1,earliest.getDate());
      var cand=null,pass;
      for(pass=0;pass<3&&!cand;pass++){
        var needInstall=pass===2?null:(pass===0?wantInstall:!wantInstall);
        var floorDate=pass===2?a.date:earliestStr;   // last pass: any later order, any install state
        for(var j=0;j<prods.length;j++){
          var p=prods[j];
          if(taken[p.id]||p.date<=a.date||p.date<floorDate)continue;
          if(needInstall!==null&&p.hasInstall!==needInstall)continue;
          if(linkedPhones[p.client])continue;      // one audit per customer phone, keeps distinct counts intact
          cand=p;break;
        }
      }
      if(!cand)continue;
      taken[cand.id]=1;linkedPhones[cand.client]=1;
      a.client=cand.client;                        // the audit and the order are the same customer
      a.link={orderId:cand.id,date:cand.date,kind:cand.hasInstall?'product_install':'product',
              cats:cand.lines.filter(function(l){return PRODUCT_CATS.indexOf(l.cat)>=0;}).map(function(l){return l.cat;})};
    }
  });

  /* --- carts --- */
  window.MD_AN_CAT_IDS.forEach(function(cat){
    (SHEET.carts[cat]||[]).forEach(function(row){
      var month=row[0],total=row[1],cleared=row[2],same=row[3];
      var days=monthDayList(month),rng=rngFor('cart'+cat+month);
      // day weights: August follows the workbook's own W1/W2/W3 cart profile; Jun/Jul weekday-shaped
      var counts=splitShaped(total,days,month,SHEET.augWeekShape[cat],'cart'+cat+month);
      // store allocation: this category's share of orders in this month (documented limitation)
      var shares=[],stotal=0;
      window.MD_AN_STORE_IDS.forEach(function(s){
        var r=(SHEET.cat[cat]||[]).filter(function(x){return x[0]===s&&x[1]===month;})[0];
        var n=r?r[2]:0;shares.push({store:s,n:n});stotal+=n;
      });
      if(!stotal){shares.forEach(function(s){s.n=(window.MD_AN_STORES[s.store].kind==='store'&&window.MD_AN_STORES[s.store].status!=='planned')?1:0;stotal+=s.n;});}
      var storeAlloc=splitCount(total,shares.map(function(s){return s.n;}),rngFor('cs'+cat+month));
      var pool=[];shares.forEach(function(s,i){for(var j=0;j<storeAlloc[i];j++)pool.push(s.store);});
      var pk=0,made=[];
      days.forEach(function(d,di){
        for(var j=0;j<counts[di];j++){
          cartSeq++;
          made.push({id:'CRT-'+String(cartSeq).padStart(6,'0'),cat:cat,store:pool[pk%pool.length]||'JP NAGAR',
            date:d.date,month:month,client:newPhone(),cleared:false,orderedSameCat:false});
          pk++;
        }
      });
      made.forEach(function(c){c.city=(window.MD_AN_STORES[c.store]||{}).city||'Bengaluru';});
      // deterministic shuffle, then flag exactly `cleared` cleared and `same` converted (⊆ cleared)
      var ord=made.map(function(c,i){return {i:i,r:rngFor('f'+cat+month+i)()};}).sort(function(a,b){return a.r-b.r;});
      for(var i=0;i<ord.length;i++){
        var c=made[ord[i].i];
        if(i<cleared)c.cleared=true;
        if(i<same){c.cleared=true;c.orderedSameCat=true;}
      }
      carts=carts.concat(made);
    });
  });

  return {
    meta:{mode:'dummy',from:window.MD_AN_DATA_FROM,to:window.MD_AN_DATA_TO,
      note:'Seeded from MD_Category_Analysis_JunAug_2026.xlsx (Metabase db 5, prepared 17 Aug 2026) and expanded to order level. Company and store-month totals reconcile to the workbook exactly.'},
    orders:orders,carts:carts,storeTotals:SHEET.storeTotals,untagged:SHEET.untagged
  };
}

/* ---- the swap point: one function to implement when the Metabase question is ready ---- */
window.MD_AN_SOURCE={
  mode:'dummy',
  _cache:null,
  /* Live implementation sketch — a saved Metabase question per shape, called through the same
     /api proxy pattern the Pending-POs import already uses (never expose a Metabase key in the
     browser). Must return the MD_AN_ROW_CONTRACT shape above.
       orders: SELECT e.id, COALESCE(e.order_placed_time,e.created_at)::date AS date,
                      b.branch_name AS store, e.client_id, c.phone AS client,
                      cat.name AS cat, SUM(i.total_price-i.total_discount) AS value,
                      SUM(i.quantity) AS qty
               FROM estimate e ... GROUP BY 1,2,3,4,5,6
       carts:  SELECT cart_number, category, MIN(created_at)::date AS date, ...
     Then group order rows by id into {lines:[...]} and set hasInstall from the presence of an
     Installation line. Nothing else in the dashboard changes. */
  metabase:function(){return Promise.reject(new Error('Metabase source not wired yet — MD_AN_SOURCE.mode is "dummy"'));},
  fetch:function(){
    var self=this;
    if(this.mode==='metabase')return this.metabase();
    if(this._cache)return Promise.resolve(this._cache);
    return new Promise(function(res){self._cache=generate();res(self._cache);});
  }
};
window.mdAnDataset=function(){return window.MD_AN_SOURCE.fetch();};

/* ══════════════════════════════════════════════════════════════════════════════════════════
   6. COMPUTE LAYER  —  pure functions over the dataset. No DOM, no globals mutated.
   A filter is {from, to, store:'all'|<store>, city:'all'|<city>}.
   ══════════════════════════════════════════════════════════════════════════════════════════ */
function inRange(d,f){return d>=f.from&&d<=f.to;}
function storeMatch(store,f){
  if(f.store&&f.store!=='all'&&store!==f.store)return false;
  if(f.city&&f.city!=='all'&&(window.MD_AN_STORES[store]||{}).city!==f.city)return false;
  return true;
}
function blankCat(){return {orders:0,value:0,qty:0,clients:{},carts:0,cleared:0,convB:0,attachNum:0,attachDen:0};}
function catShell(){var o={};window.MD_AN_CAT_IDS.forEach(function(c){o[c]=blankCat();});return o;}
function finishCat(c){
  c.customers=Object.keys(c.clients).length;
  c.aov=c.orders?c.value/c.orders:0;
  c.convApct=c.carts?c.cleared/c.carts*100:null;
  c.convBpct=c.carts?c.convB/c.carts*100:null;
  c.attachPct=c.attachDen?c.attachNum/c.attachDen*100:null;
  delete c.clients;return c;
}

/* Month-anchored weeks, exactly like the workbook's Aug Weekly tab: W1 = 1–7 of the month,
   W2 = 8–14, W3 = 15–21, W4 = 22–28, W5 = 29–end, each clipped to the selected range. Anchoring
   on the month (rather than on Mon–Sun) is what makes these rows comparable to the workbook. */
window.mdAnWeeks=function(f){
  var out=[],cur=f.from;
  var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  while(cur<=f.to){
    var y=+cur.slice(0,4),mo=+cur.slice(5,7),dom=+cur.slice(8,10);
    var wk=Math.min(4,Math.floor((dom-1)/7)), ws=wk*7+1, we=Math.min(monthDays(cur.slice(0,7)),wk===4?monthDays(cur.slice(0,7)):ws+6);
    var from=dstr(y,mo,Math.max(ws,dom)), to=dstr(y,mo,we);
    if(to>f.to)to=f.to;
    var days=Math.round((new Date(to)-new Date(from))/86400000)+1;
    out.push({key:cur.slice(0,7)+'-W'+(wk+1),label:'W'+(wk+1)+' '+MON[mo-1]+' '+(+from.slice(8,10))+'–'+(+to.slice(8,10)),
      month:cur.slice(0,7),from:from,to:to,days:days,partial:days<7});
    var nx=new Date(y,mo-1,we+1);cur=dstr(nx.getFullYear(),nx.getMonth()+1,nx.getDate());
  }
  return out;
};

/* Main aggregate. Returns per-category totals, a store × category matrix, a daily series and the
   site-audit conversion funnel (with the rows behind it, for the drill-down modal + CSV). */
window.mdAnAggregate=function(ds,f){
  var cats=catShell(), byStore={}, daily={};
  window.MD_AN_STORE_IDS.forEach(function(s){byStore[s]=catShell();byStore[s]._any=false;});

  ds.orders.forEach(function(o){
    if(!inRange(o.date,f)||!storeMatch(o.store,f))return;
    var seen={};
    o.lines.forEach(function(l){
      var C=cats[l.cat],S=byStore[o.store][l.cat];
      if(!C)return;
      if(!seen[l.cat]){seen[l.cat]=1;C.orders++;S.orders++;byStore[o.store]._any=true;
        C.clients[o.client]=1;S.clients[o.client]=1;
        var cm=window.MD_AN_CATEGORIES[l.cat];
        if(cm&&cm.attach){C.attachDen++;S.attachDen++;if(o.hasInstall){C.attachNum++;S.attachNum++;}}
        daily[o.date]=daily[o.date]||{};daily[o.date][l.cat]=daily[o.date][l.cat]||{orders:0,value:0,carts:0};
        daily[o.date][l.cat].orders++;
      }
      C.value+=l.value;S.value+=l.value;C.qty+=l.qty;S.qty+=l.qty;
      if(daily[o.date]&&daily[o.date][l.cat])daily[o.date][l.cat].value+=l.value;
    });
  });

  ds.carts.forEach(function(c){
    if(!inRange(c.date,f)||!storeMatch(c.store,f))return;
    var C=cats[c.cat],S=byStore[c.store][c.cat];
    if(!C)return;
    C.carts++;S.carts++;
    if(c.cleared){C.cleared++;S.cleared++;}
    if(c.orderedSameCat){C.convB++;S.convB++;}
    daily[c.date]=daily[c.date]||{};daily[c.date][c.cat]=daily[c.date][c.cat]||{orders:0,value:0,carts:0};
    daily[c.date][c.cat].carts++;
  });

  /* Site audit → order conversion. Judged PER AUDIT, never "has this phone ever ordered" — the
     same rule the COE follow-up queue uses (a client legitimately has several audits and several
     orders). Two outcomes are reported separately because a customer can buy the material and
     not take installation from us: `product` = material order only, `productInstall` = material +
     installation. Conversion is counted whenever the order lands, even after the range ends. */
  var auditRows=[],conv={audits:0,product:0,productInstall:0,none:0};
  ds.orders.forEach(function(o){
    if(!o.lines.some(function(l){return l.cat==='site_audit';}))return;
    if(!inRange(o.date,f)||!storeMatch(o.store,f))return;
    conv.audits++;
    var kind=o.link?o.link.kind:'none';
    if(kind==='product_install')conv.productInstall++;else if(kind==='product')conv.product++;else conv.none++;
    auditRows.push({pi:o.id,date:o.date,store:o.store,client:o.client,kind:kind,
      link:o.link?o.link.orderId:'',linkDate:o.link?o.link.date:'',
      cats:o.link?(o.link.cats||[]).map(function(c){return window.MD_AN_CATEGORIES[c].label;}).join(' + '):'',
      tat:o.link?Math.round((new Date(o.link.date)-new Date(o.date))/86400000):null});
  });
  conv.converted=conv.product+conv.productInstall;
  conv.pct=conv.audits?conv.converted/conv.audits*100:null;
  conv.productPct=conv.audits?conv.product/conv.audits*100:null;
  conv.productInstallPct=conv.audits?conv.productInstall/conv.audits*100:null;
  var tats=auditRows.filter(function(r){return r.tat!=null&&r.tat>=0;}).map(function(r){return r.tat;}).sort(function(a,b){return a-b;});
  conv.medianTat=tats.length?tats[Math.floor(tats.length/2)]:null;

  window.MD_AN_CAT_IDS.forEach(function(c){finishCat(cats[c]);});
  Object.keys(byStore).forEach(function(s){window.MD_AN_CAT_IDS.forEach(function(c){finishCat(byStore[s][c]);});});

  var tot={orders:0,value:0,carts:0,cleared:0,convB:0};
  window.MD_AN_CAT_IDS.forEach(function(c){tot.orders+=cats[c].orders;tot.value+=cats[c].value;tot.carts+=cats[c].carts;tot.cleared+=cats[c].cleared;tot.convB+=cats[c].convB;});
  tot.convApct=tot.carts?tot.cleared/tot.carts*100:null;
  tot.convBpct=tot.carts?tot.convB/tot.carts*100:null;

  return {cats:cats,byStore:byStore,daily:daily,conv:conv,auditRows:auditRows,totals:tot,filter:f};
};

/* Penetration = category orders ÷ that store's TOTAL confirmed orders (all categories) in the
   same window. The workbook calls this "the metric that travels to a new store" — it is the one
   number a 1-month-old store can be compared with a 40-month-old store on.
   Store totals are monthly, so a partial range is pro-rated on the days actually covered. */
window.mdAnPenetration=function(ds,f,agg){
  var out=[];
  window.MD_AN_STORE_IDS.forEach(function(s){
    if(!storeMatch(s,f))return;
    var st=window.MD_AN_STORES[s];
    var total=0,exact=true;
    window.MD_AN_MONTHS.forEach(function(mm){
      var mFrom=mm.m+'-01',mTo=mm.m+'-'+pad2(mm.dataDays);
      var from=f.from>mFrom?f.from:mFrom, to=f.to<mTo?f.to:mTo;
      if(from>to)return;
      var days=Math.round((new Date(to)-new Date(from))/86400000)+1;
      var monthTotal=(ds.storeTotals[s]||{})[mm.m]||0;
      total+=monthTotal*days/mm.dataDays;
      if(days!==mm.dataDays)exact=false;
    });
    var row={store:s,label:st.label,city:st.city,status:st.status,kind:st.kind,opened:st.opened,
      monthsLive:Math.round((new Date(f.to)-new Date(st.opened))/86400000/30.44*10)/10,
      totalOrders:Math.round(total),exact:exact,cats:{}};
    if(row.monthsLive<0)row.monthsLive=0;
    window.MD_AN_CAT_IDS.forEach(function(c){
      var n=agg.byStore[s][c].orders;
      row.cats[c]={orders:n,pct:total>0?n/total*100:null};
    });
    row.catOrders=window.MD_AN_CAT_IDS.reduce(function(a,c){return a+row.cats[c].orders;},0);
    row.sharePct=total>0?row.catOrders/total*100:null;
    out.push(row);
  });
  return out;
};

/* ══════════════════════════════════════════════════════════════════════════════════════════
   7. TARGETS  —  seeded from the workbook's own planning model, then editable and stored in
   Supabase `app_settings` under key `cat_analytics_targets` (same tiny key→jsonb table the
   installer payout rates use). Editable numbers are ORDERS per store per category per month,
   plus a conversion / attach / audit-conversion target per category per month, plus AOV.
   Everything else is DERIVED so the grid stays small:
        revenue target = orders × AOV          carts target = orders ÷ cart-conversion-B target
   ══════════════════════════════════════════════════════════════════════════════════════════ */
window.MD_AN_TARGET_MONTHS=['2026-06','2026-07','2026-08','2026-09','2026-10','2026-11','2026-12'];

/* Jun–Aug: the workbook's Projections STEP 2 — per-store monthly order targets derived from
   category penetration at the mature stores, applied to a 450-order mature store and a 200-order
   maturing store. Wall Panels / CNC targets are modelled (those categories are modelled too). */
var PROJ_BY_MATURITY={
  mature:  {site_audit:25,installation:28,wallpaper:28,flooring:12,wallpanel:8,cnc:4},
  ramping: {site_audit:11,installation:13,wallpaper:12,flooring:5, wallpanel:4,cnc:2},
  planned: {site_audit:0, installation:0, wallpaper:0, flooring:0, wallpanel:0,cnc:0},
  channel: {site_audit:0, installation:0, wallpaper:0, flooring:0, wallpanel:0,cnc:0}
};
/* Sep–Dec: the workbook's Sheet1 bottom-up model — every store is an ARCHETYPE × a MATURITY
   INDEX, so growth comes from stores maturing and opening rather than from JP Nagar scaling up.
   Archetype levels are the store's own Aug run-rate grown at the mature-store rate (12% MoM). */
var MATURE_MOM=0.12;
var ARCHETYPE_AUG={ // orders/month, Aug 1–17 grossed to 31 days (Sheet1 STEP 3)
  'JP NAGAR':  {site_audit:52.88,wallpaper:62.00,flooring:20.06},
  'WHITEFIELD':{site_audit:29.18,wallpaper:49.24,flooring:14.59},
  'YELAHANKA': {site_audit:18.24,wallpaper:38.29,flooring:9.12},
  'B2B':       {site_audit:0,    wallpaper:3.65, flooring:5.47},
  'HQ':        {site_audit:1.82, wallpaper:9.12, flooring:3.65}
};
var MATURITY_INDEX={ // Sheet1 STEP 2 — share of the archetype's level in that same month
  'JP NAGAR':          {'2026-09':1,'2026-10':1,'2026-11':1,'2026-12':1},
  'WHITEFIELD':        {'2026-09':1,'2026-10':1,'2026-11':1,'2026-12':1},
  'YELAHANKA':         {'2026-09':1,'2026-10':1,'2026-11':1,'2026-12':1},
  'B2B':               {'2026-09':1,'2026-10':1,'2026-11':1,'2026-12':1},
  'HQ':                {'2026-09':1,'2026-10':1,'2026-11':1,'2026-12':1},
  'GACHIBOWLI':        {'2026-09':0.5766,'2026-10':0.7883,'2026-11':1,'2026-12':1},
  'KOMPALLY':          {'2026-09':0.3936,'2026-10':0.5575,'2026-11':0.7214,'2026-12':0.8853},
  'HSR LAYOUT':        {'2026-09':0.5546,'2026-10':0.6582,'2026-11':0.7617,'2026-12':0.8653},
  'RR NAGAR':          {'2026-09':0.25,'2026-10':0.40,'2026-11':0.55,'2026-12':0.70},
  'ELECTRONIC CITY':   {'2026-09':0.25,'2026-10':0.40,'2026-11':0.55,'2026-12':0.70},
  'BASAVESHWARA NAGAR':{'2026-09':0,'2026-10':0.25,'2026-11':0.40,'2026-12':0.55},
  'INDIRANAGAR':       {'2026-09':0,'2026-10':0.25,'2026-11':0.40,'2026-12':0.55},
  'CHHABARIA':         {'2026-09':0,'2026-10':0,'2026-11':0.25,'2026-12':0.40}
};
// Modelled categories are planned as a share of the store's wallpaper plan.
var MODELLED_SHARE={wallpanel:0.12,cnc:0.06};
// Installation is DERIVED, never set by hand: wallpaper/flooring/panel/CNC volume × the attach
// ramp, plus "other installation" (quartz, tiles, PVC ceiling) at 4.575% of that volume.
var OTHER_INSTALL_SHARE=0.04575;
var ATTACH_RAMP={ // Aug actual → Dec target, linear (Plan Sep-Dec STEP 2)
  wallpaper:{'2026-06':52.07,'2026-07':52.07,'2026-08':52.07,'2026-09':56.55,'2026-10':61.04,'2026-11':65.52,'2026-12':70},
  flooring: {'2026-06':56.25,'2026-07':56.25,'2026-08':56.25,'2026-09':59.69,'2026-10':63.13,'2026-11':66.56,'2026-12':70},
  wallpanel:{'2026-06':52.07,'2026-07':52.07,'2026-08':52.07,'2026-09':56.55,'2026-10':61.04,'2026-11':65.52,'2026-12':70},
  cnc:      {'2026-06':52.07,'2026-07':52.07,'2026-08':52.07,'2026-09':56.55,'2026-10':61.04,'2026-11':65.52,'2026-12':70}
};
var CONVB_RAMP={ // Plan Carts SCENARIO A — conversion improves gradually, carts carry the rest
  site_audit:  {'2026-06':71.29,'2026-07':71.29,'2026-08':71.29,'2026-09':73.47,'2026-10':75.65,'2026-11':77.82,'2026-12':80},
  installation:{'2026-06':35.65,'2026-07':35.65,'2026-08':35.65,'2026-09':39.24,'2026-10':42.83,'2026-11':46.41,'2026-12':50},
  wallpaper:   {'2026-06':14.29,'2026-07':14.29,'2026-08':14.29,'2026-09':15.72,'2026-10':17.15,'2026-11':18.57,'2026-12':20},
  flooring:    {'2026-06':13.12,'2026-07':13.12,'2026-08':13.12,'2026-09':14.84,'2026-10':16.56,'2026-11':18.28,'2026-12':20},
  wallpanel:   {'2026-06':14.50,'2026-07':14.50,'2026-08':14.50,'2026-09':15.90,'2026-10':17.30,'2026-11':18.70,'2026-12':20},
  cnc:         {'2026-06':8.00,'2026-07':8.00,'2026-08':8.00,'2026-09':11.00,'2026-10':14.00,'2026-11':17.00,'2026-12':20}
};
// Audit → order conversion target. NOT in the workbook (it needs the phone-level join) — seeded at
// the level the dummy set produces and ramped to 60%. Edit it once the real number is known.
var AUDIT_CONV_TARGET={'2026-06':45,'2026-07':45,'2026-08':45,'2026-09':49,'2026-10':53,'2026-11':56,'2026-12':60};

window.mdAnTargetDefaults=function(){
  var t={version:1,warnAtPct:80,aov:{},orders:{},convB:{},attach:{},auditConv:{},
    note:'Seeded from the workbook: Jun–Aug from Projections STEP 2 (penetration benchmark × store size), Sep–Dec from the Sheet1 bottom-up store model (archetype × maturity index, mature stores at 12% MoM). Installation is derived from attach rate, never set by hand.'};
  window.MD_AN_CAT_IDS.forEach(function(c){t.aov[c]=window.MD_AN_CATEGORIES[c].aov;});
  window.MD_AN_TARGET_MONTHS.forEach(function(m){
    t.convB[m]={};t.attach[m]={};t.auditConv[m]=AUDIT_CONV_TARGET[m]||50;
    window.MD_AN_CAT_IDS.forEach(function(c){
      if(CONVB_RAMP[c])t.convB[m][c]=CONVB_RAMP[c][m];
      if(ATTACH_RAMP[c])t.attach[m][c]=ATTACH_RAMP[c][m];
    });
    t.orders[m]={};
    window.MD_AN_STORE_IDS.forEach(function(s){
      var st=window.MD_AN_STORES[s],row={};
      var planned=st.status==='planned'&&m<st.opened.slice(0,7);
      if(m<='2026-08'){
        var base=PROJ_BY_MATURITY[st.status]||PROJ_BY_MATURITY.channel;
        window.MD_AN_CAT_IDS.forEach(function(c){row[c]=planned?0:(base[c]||0);});
      }else{
        var arch=ARCHETYPE_AUG[s]||ARCHETYPE_AUG[st.archetype]||{site_audit:0,wallpaper:0,flooring:0};
        var idx=(MATURITY_INDEX[s]||{})[m];if(idx==null)idx=st.kind==='channel'?1:0;
        var mi=window.MD_AN_TARGET_MONTHS.indexOf(m)-window.MD_AN_TARGET_MONTHS.indexOf('2026-08');
        var g=Math.pow(1+MATURE_MOM,mi);
        row.site_audit=Math.round(arch.site_audit*g*idx);
        row.wallpaper =Math.round(arch.wallpaper *g*idx);
        row.flooring  =Math.round(arch.flooring  *g*idx);
        row.wallpanel =Math.round(row.wallpaper*MODELLED_SHARE.wallpanel);
        row.cnc       =Math.round(row.wallpaper*MODELLED_SHARE.cnc);
      }
      // Installation derived from the attach ramp on this store's own product plan
      var derived=0;
      ['wallpaper','flooring','wallpanel','cnc'].forEach(function(c){
        derived+=(row[c]||0)*((t.attach[m][c]||0)/100);
      });
      derived+=((row.wallpaper||0)+(row.flooring||0))*OTHER_INSTALL_SHARE;
      row.installation=Math.round(derived);
      t.orders[m][s]=row;
    });
  });
  return t;
};

/* Merge a stored target object over the defaults, so a target file written before a category or a
   store existed still works (and a newly added category picks up its seeded default). */
window.mdAnTargetsMerge=function(saved){
  var d=window.mdAnTargetDefaults();
  if(!saved||typeof saved!=='object')return d;
  var out=JSON.parse(JSON.stringify(d));
  if(saved.warnAtPct!=null)out.warnAtPct=+saved.warnAtPct;
  ['aov','auditConv'].forEach(function(k){if(saved[k])Object.keys(saved[k]).forEach(function(x){if(saved[k][x]!=null&&saved[k][x]!=='')out[k][x]=+saved[k][x];});});
  ['convB','attach'].forEach(function(k){if(saved[k])Object.keys(saved[k]).forEach(function(m){out[k][m]=out[k][m]||{};Object.keys(saved[k][m]||{}).forEach(function(c){if(saved[k][m][c]!=null&&saved[k][m][c]!=='')out[k][m][c]=+saved[k][m][c];});});});
  if(saved.orders)Object.keys(saved.orders).forEach(function(m){
    out.orders[m]=out.orders[m]||{};
    Object.keys(saved.orders[m]||{}).forEach(function(s){
      out.orders[m][s]=out.orders[m][s]||{};
      Object.keys(saved.orders[m][s]||{}).forEach(function(c){var v=saved.orders[m][s][c];if(v!=null&&v!=='')out.orders[m][s][c]=+v;});
    });
  });
  out.savedAt=saved.savedAt||null;out.savedBy=saved.savedBy||null;
  return out;
};

/* How much of a monthly target belongs to the selected range. A target is a FULL-MONTH number, so
   a 17-day window is compared against 17/31 of it — never against the whole month (that is the
   mistake the workbook's Read Me warns about for August). */
window.mdAnProrate=function(t,f,store,cat){
  var target=0,frac=0;
  window.MD_AN_TARGET_MONTHS.forEach(function(m){
    var dim=monthDays(m), mFrom=m+'-01', mTo=m+'-'+pad2(dim);
    var from=f.from>mFrom?f.from:mFrom, to=f.to<mTo?f.to:mTo;
    if(from>to)return;
    var days=Math.round((new Date(to)-new Date(from))/86400000)+1;
    var v=((t.orders[m]||{})[store]||{})[cat];
    if(v==null)return;
    target+=v*days/dim;frac+=days/dim;
  });
  return {orders:target,months:frac};
};
/* A rate target (cart conversion, attach %, audit conversion) for the range = the day-weighted
   average of the monthly targets it spans. */
window.mdAnRateTarget=function(t,f,kind,cat){
  var num=0,den=0;
  window.MD_AN_TARGET_MONTHS.forEach(function(m){
    var dim=monthDays(m), mFrom=m+'-01', mTo=m+'-'+pad2(dim);
    var from=f.from>mFrom?f.from:mFrom, to=f.to<mTo?f.to:mTo;
    if(from>to)return;
    var days=Math.round((new Date(to)-new Date(from))/86400000)+1;
    var v=kind==='auditConv'?t.auditConv[m]:(t[kind][m]||{})[cat];
    if(v==null)return;
    num+=v*days;den+=days;
  });
  return den?num/den:null;
};

/* Evaluate the selected range against the targets and return every shortfall, worst first.
   level: 'ok' ≥100% of target · 'watch' warnAtPct–99% · 'risk' < warnAtPct.
   Stores that are not open yet, and channels with a zero target, are skipped rather than failed. */
var MIN_ORDERS_TARGET=2;  // pro-rated orders target below which a shortfall is noise, not news
var MIN_CARTS_RATE=25;    // carts needed before a cart-conversion rate is worth judging
var MIN_ORDERS_RATE=8;    // orders needed before an attach rate is worth judging
window.MD_AN_MIN={orders:MIN_ORDERS_TARGET,carts:MIN_CARTS_RATE,attach:MIN_ORDERS_RATE};
window.mdAnEvaluate=function(ds,f,agg,t){
  var rows=[];
  function push(scope,store,cat,metric,actual,target,unit){
    if(target==null||!(target>0))return;
    var pct=actual/target*100;
    var level=pct>=100?'ok':(pct>=t.warnAtPct?'watch':'risk');
    rows.push({scope:scope,store:store,storeLabel:store==='ALL'?'All stores':window.mdAnStoreLabel(store),
      cat:cat,catLabel:cat==='ALL'?'All categories':window.MD_AN_CATEGORIES[cat].label,
      metric:metric,actual:actual,target:target,pct:pct,level:level,unit:unit||''});
  }
  var stores=window.MD_AN_STORE_IDS.filter(function(s){
    if(!storeMatch(s,f))return false;
    var st=window.MD_AN_STORES[s];
    if(st.status==='planned'&&f.to<st.opened)return false;
    return true;
  });
  stores.forEach(function(s){
    window.MD_AN_CAT_IDS.forEach(function(c){
      var pr=window.mdAnProrate(t,f,s,c);
      var a=agg.byStore[s][c];
      // MIN_ORDERS: below a 2-order pro-rated target the arithmetic is louder than the signal — a
      // store "missing" 1.1 CNC orders is not a store in trouble, and burying twenty real
      // shortfalls under forty of those is how a warning list stops being read.
      if(pr.orders>=MIN_ORDERS_TARGET){
        push('store',s,c,'Orders',a.orders,pr.orders,'orders');
        push('store',s,c,'Revenue',a.value,pr.orders*(t.aov[c]||0),'₹');
      }
      var conv=window.mdAnRateTarget(t,f,'convB',c);
      if(conv>0&&pr.orders>=MIN_ORDERS_TARGET)push('store',s,c,'Carts',a.carts,pr.orders/(conv/100),'carts');
      if(conv>0&&a.carts>=MIN_CARTS_RATE)push('store',s,c,'Cart conversion %',a.convBpct||0,conv,'%');
      if(window.MD_AN_CATEGORIES[c].attach&&a.attachDen>=MIN_ORDERS_RATE){
        push('store',s,c,'Installation attach %',a.attachPct||0,window.mdAnRateTarget(t,f,'attach',c),'%');
      }
    });
  });
  // company level, and the audit→order conversion which only makes sense company-wide at low volume
  window.MD_AN_CAT_IDS.forEach(function(c){
    var tot=0;stores.forEach(function(s){tot+=window.mdAnProrate(t,f,s,c).orders;});
    push('company','ALL',c,'Orders',agg.cats[c].orders,tot,'orders');
    push('company','ALL',c,'Revenue',agg.cats[c].value,tot*(t.aov[c]||0),'₹');
  });
  if(agg.conv.audits>=5)push('company','ALL','site_audit','Audit → order conversion %',agg.conv.pct||0,window.mdAnRateTarget(t,f,'auditConv',null),'%');
  var bad=rows.filter(function(r){return r.level!=='ok';}).sort(function(a,b){return a.pct-b.pct;});
  var pairs={};bad.forEach(function(r){if(r.scope==='store')pairs[r.store+'|'+r.cat]=1;});
  return {all:rows,bad:bad,pairs:Object.keys(pairs).length,
    risk:bad.filter(function(r){return r.level==='risk';}),
    watch:bad.filter(function(r){return r.level==='watch';}),
    storesAtRisk:[...new Set(bad.filter(function(r){return r.level==='risk'&&r.scope==='store';}).map(function(r){return r.store;}))]};
};

/* ══════════════════════════════════════════════════════════════════════════════════════════
   8. FORMATTERS & CHART PRIMITIVES
   Every chart here is a plain SVG string — no chart library, no build step, consistent with the
   rest of this codebase. Design rules applied throughout (and the reason each is written down):
     • ONE axis, always. No chart plots two different scales against each other.
     • A chart with several categories is drawn as SMALL MULTIPLES (one single-series chart per
       category), never as six coloured series on one plot — six hues can't be told apart under
       colour-vision deficiency, and the workbook's story is per-category anyway.
     • Marks: bars ≤24px thick with a 4px rounded data-end, lines 2px, end-dots r4 with a 2px
       white ring, area washes at 10% opacity, gridlines hairline-solid one step off the surface.
     • A 2px surface-coloured GAP separates touching marks — never a border drawn around a mark.
     • Labels are selective (endpoint / extreme / short series), never one number per point, and
       label text always wears an ink token, never the series colour.
     • Every chart has a table twin below or beside it, so no value is reachable only by hover.
     • Status colour (green/amber/red) ALWAYS ships with an icon and a word — never colour alone.
   Sequential ramp below is a single navy hue, light→dark, validated for monotone lightness and
   for clearing the surface at its light end.
   ══════════════════════════════════════════════════════════════════════════════════════════ */
var RAMP=['#93b5d6','#75a1cb','#5688b9','#3b6f9c','#265584','#1F3A5F'];
var GRID='#e7ecf3', SURFACE='#ffffff';
window.MD_AN_RAMP=RAMP;

function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
window.mdAnNum=function(n){if(n==null||isNaN(n))return '—';return Math.round(n).toLocaleString('en-IN');};
window.mdAnNum1=function(n){if(n==null||isNaN(n))return '—';return (Math.round(n*10)/10).toLocaleString('en-IN');};
window.mdAnPct=function(n,dp){if(n==null||isNaN(n))return '—';return (dp?(Math.round(n*10)/10):Math.round(n))+'%';};
/* ₹ compact in Indian units — a dashboard reads ₹8.7L faster than ₹8,73,000, and the exact
   figure is always in the table/CSV underneath. */
window.mdAnRup=function(n){
  if(n==null||isNaN(n))return '—';
  var a=Math.abs(n),s=n<0?'-':'';
  if(a>=10000000)return s+'₹'+(Math.round(a/100000)/100).toFixed(2).replace(/\.00$/,'')+'Cr';
  if(a>=100000)return s+'₹'+(Math.round(a/1000)/100).toFixed(2).replace(/\.00$/,'')+'L';
  if(a>=1000)return s+'₹'+(Math.round(a/100)/10).toFixed(1).replace(/\.0$/,'')+'K';
  return s+'₹'+Math.round(a).toLocaleString('en-IN');
};
window.mdAnRupFull=function(n){return n==null||isNaN(n)?'—':'₹'+Math.round(n).toLocaleString('en-IN');};
window.mdAnDelta=function(cur,prev,goodUp){
  // A null/absent current or previous value means "not comparable" — rendering it as ▼100% (which
  // an earlier version did, because null coerced to 0) invented a collapse that never happened.
  if(cur==null||prev==null||!isFinite(cur)||!isFinite(prev)||prev===0)return '';
  var d=(cur-prev)/Math.abs(prev)*100, up=d>=0, good=goodUp===false?!up:up;
  var col=Math.abs(d)<0.5?'var(--muted)':(good?'var(--green)':'var(--red)');
  return '<span style="color:'+col+';font-weight:700">'+(up?'▲':'▼')+' '+Math.abs(Math.round(d))+'%</span>';
};

/* ---- sparkline: single series, 2px line + 10% wash + end dot with a 2px surface ring ---- */
window.mdAnSpark=function(vals,color,w,h,label){
  w=w||120;h=h||30;
  var n=vals.length;
  if(!n)return '<div style="height:'+h+'px"></div>';
  var max=Math.max.apply(null,vals),min=0;
  if(max===min)max=min+1;
  var px=function(i){return n===1?w/2:(i/(n-1))*(w-6)+3;};
  var py=function(v){return h-3-((v-min)/(max-min))*(h-8);};
  var pts=vals.map(function(v,i){return px(i)+','+py(v);}).join(' ');
  var area='M3,'+(h-3)+' L'+vals.map(function(v,i){return px(i)+','+py(v);}).join(' L')+' L'+px(n-1)+','+(h-3)+' Z';
  return '<svg viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" role="img" aria-label="'+esc(label||'trend')+'" style="display:block;overflow:visible">'+
    '<path d="'+area+'" fill="'+color+'" opacity="0.10"></path>'+
    '<polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline>'+
    '<circle cx="'+px(n-1)+'" cy="'+py(vals[n-1])+'" r="4" fill="'+color+'" stroke="'+SURFACE+'" stroke-width="2"></circle>'+
    '<title>'+esc(label||'')+'</title></svg>';
};

/* ---- small-multiple column chart: one series, value on each cap while the series is short ---- */
window.mdAnColumns=function(items,color,w,h,fmt){
  w=w||220;h=h||96;fmt=fmt||window.mdAnNum;
  var n=items.length;if(!n)return '';
  var max=Math.max.apply(null,items.map(function(i){return i.v||0;}));if(max<=0)max=1;
  var padB=18,padT=16,plotH=h-padB-padT;
  var band=w/n, bw=Math.min(24,band-8);
  var out='<svg viewBox="0 0 '+w+' '+h+'" width="100%" height="'+h+'" role="img" style="display:block">';
  out+='<line x1="0" y1="'+(h-padB)+'" x2="'+w+'" y2="'+(h-padB)+'" stroke="'+GRID+'" stroke-width="1"></line>';
  items.forEach(function(it,i){
    var bh=Math.max(1,(it.v||0)/max*plotH), x=i*band+(band-bw)/2, y=h-padB-bh;
    out+='<g><rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bh+'" rx="4" fill="'+color+'"'+(it.dim?' opacity="0.35"':'')+'></rect>'+
      '<title>'+esc(it.label+': '+fmt(it.v))+'</title></g>';
    // value on the cap (series is 3–6 long here; anything longer falls back to max + last only)
    var show=n<=6||i===n-1||(it.v||0)===max;
    if(show)out+='<text x="'+(x+bw/2)+'" y="'+(y-5)+'" text-anchor="middle" font-size="10.5" font-weight="700" fill="#1b2230">'+esc(fmt(it.v))+'</text>';
    out+='<text x="'+(x+bw/2)+'" y="'+(h-5)+'" text-anchor="middle" font-size="9.5" fill="#67748a">'+esc(it.short||it.label)+'</text>';
  });
  return out+'</svg>';
};

/* ---- part-to-whole bar: ordered steps of ONE hue + a neutral for "did not happen".
        2px surface gaps between segments; labels ride outside when a segment is too narrow. ---- */
window.mdAnStackBar=function(segs,total,h){
  h=h||26;
  if(!total)return '<div style="font-size:11.5px;color:var(--muted);padding:6px 0">No rows in range</div>';
  var out='<div style="display:flex;height:'+h+'px;gap:2px;border-radius:6px;overflow:hidden;background:'+SURFACE+'">';
  segs.forEach(function(s){
    var pc=s.v/total*100;
    if(pc<=0)return;
    var wide=pc>=14;
    out+='<div title="'+esc(s.label+': '+s.v+' ('+Math.round(pc)+'%)')+'" style="flex:0 0 '+pc+'%;background:'+s.color+';display:grid;place-items:center;color:'+(s.ink||'#fff')+';font-size:10.5px;font-weight:800;white-space:nowrap;overflow:hidden">'+(wide?Math.round(pc)+'%':'')+'</div>';
  });
  return out+'</div>';
};

/* ---- meter: ratio against a target. Fill carries severity, track is a lighter step of the same
        ramp so the state reads across the whole bar. Always paired with an icon + word. ---- */
window.MD_AN_LEVELS={ok:{ico:'✓',word:'On target',col:'var(--green)',track:'#dbeee2'},
                     watch:{ico:'▲',word:'Watch',col:'var(--amber)',track:'#f7ecd2'},
                     risk:{ico:'⚠',word:'At risk',col:'var(--red)',track:'#f6dedb'},
                     none:{ico:'·',word:'No target',col:'var(--muted)',track:'#e9edf3'}};
window.mdAnMeter=function(pct,level,h){
  var L=window.MD_AN_LEVELS[level]||window.MD_AN_LEVELS.none;
  h=h||6;
  var w=pct==null?0:Math.max(0,Math.min(100,pct));
  return '<div style="height:'+h+'px;background:'+L.track+';border-radius:'+(h/2)+'px;overflow:hidden">'+
    '<div style="height:100%;width:'+w+'%;background:'+L.col+';border-radius:'+(h/2)+'px"></div></div>';
};
window.mdAnLevelChip=function(level,pct){
  var L=window.MD_AN_LEVELS[level]||window.MD_AN_LEVELS.none;
  return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:800;color:'+L.col+'">'+
    L.ico+' '+L.word+(pct!=null?' · '+Math.round(pct)+'%':'')+'</span>';
};
/* Heat cell background from the validated single-hue ramp; the number is always printed too, so
   nothing is encoded by colour alone. */
window.mdAnHeat=function(v,max){
  if(v==null||!max||v<=0)return {bg:'#f7f9fc',fg:'#67748a'};
  var i=Math.min(RAMP.length-1,Math.floor(v/max*RAMP.length));
  return {bg:RAMP[i],fg:i>=3?'#fff':'#1b2230'};
};

/* ══════════════════════════════════════════════════════════════════════════════════════════
   9. RENDERERS
   Each returns an HTML string. Admin.html owns the DOM, the filter state and the handlers; this
   file owns the arithmetic and the markup. Handlers the host page must provide (kept to a small,
   explicit contract so nothing here reaches into Admin.html's internals):
       anSetTab(tab) · anApplyRange() · anQuickRange(days) · anSetMonthRange(monthKey)
       anSetStore(v) · anSetCity(v) · anDrill(key) · anCsv(key)
       anTargetInput(month,store,cat,el) · anTargetRate(kind,month,cat,el) · anTargetAov(cat,el)
       anTargetWarnAt(el) · anSaveTargets() · anResetTargets()
   Drill-down payloads are published through mdAnSetDrill(); Admin.html renders them generically.
   ══════════════════════════════════════════════════════════════════════════════════════════ */
window.MD_AN_DRILL={};
window.mdAnSetDrill=function(key,spec){window.MD_AN_DRILL[key]=spec;};

/* One context object per render, so every tab shows numbers from the same slice. */
window.mdAnBuildCtx=function(ds,f,t){
  var agg=window.mdAnAggregate(ds,f);
  // previous window of the same length, immediately before `from` — the honest comparison for a
  // "vs previous period" delta (a calendar-month comparison would break for a 17-day range).
  var days=Math.round((new Date(f.to)-new Date(f.from))/86400000)+1;
  var pTo=new Date(new Date(f.from).getTime()-86400000), pFrom=new Date(pTo.getTime()-(days-1)*86400000);
  var pf={from:dstr(pFrom.getFullYear(),pFrom.getMonth()+1,pFrom.getDate()),
          to:dstr(pTo.getFullYear(),pTo.getMonth()+1,pTo.getDate()),store:f.store,city:f.city};
  var prev=pf.to>=window.MD_AN_DATA_FROM?window.mdAnAggregate(ds,pf):null;
  return {ds:ds,f:f,t:t,agg:agg,prev:prev,prevRange:pf,days:days,
    ev:window.mdAnEvaluate(ds,f,agg,t),pen:window.mdAnPenetration(ds,f,agg)};
};

/* ---- daily series for a category, used by the card sparklines ---- */
function dailySeries(ctx,cat,key){
  var out=[],cur=ctx.f.from;
  while(cur<=ctx.f.to){
    var d=ctx.agg.daily[cur];
    out.push(d&&d[cat]?d[cat][key]:0);
    var nx=new Date(new Date(cur).getTime()+86400000);
    cur=dstr(nx.getFullYear(),nx.getMonth()+1,nx.getDate());
  }
  return out;
}

/* ---- the amber/red banner that carries the target warnings across every tab ---- */
window.mdAnWarnBanner=function(ctx){
  var ev=ctx.ev;
  if(!ev.bad.length)return '<div style="display:flex;align-items:center;gap:10px;background:var(--greenbg);border:1px solid #b6ddc4;border-radius:10px;padding:10px 14px;margin:0 0 16px;font-size:12.5px;font-weight:700;color:var(--green)">✓ Every store and category is at or above its pro-rated target for this range.</div>';
  var risk=ev.risk.length,watch=ev.watch.length;
  var stores=ev.storesAtRisk.map(window.mdAnStoreLabel);
  var top=ev.bad.slice(0,4).map(function(r){
    return '<span style="display:inline-flex;align-items:center;gap:5px;background:#fff;border:1px solid var(--line);border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:700">'+
      window.MD_AN_LEVELS[r.level].ico+' '+esc(r.storeLabel)+' · '+esc(r.catLabel)+' '+esc(r.metric)+' <b style="color:'+window.MD_AN_LEVELS[r.level].col+'">'+Math.round(r.pct)+'%</b></span>';
  }).join(' ');
  return '<div style="background:'+(risk?'var(--redbg)':'var(--amberbg)')+';border:1px solid '+(risk?'#e6b3ad':'#e8c97a')+';border-radius:10px;padding:12px 14px;margin:0 0 16px">'+
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'+
    '<b style="font-size:13px;color:'+(risk?'var(--red)':'var(--amber)')+'">'+(risk?'⚠ '+risk+' target'+(risk===1?'':'s')+' at risk':'▲ '+watch+' target'+(watch===1?'':'s')+' to watch')+'</b>'+
    (risk&&watch?'<span style="font-size:12px;color:var(--amber);font-weight:700">▲ '+watch+' more to watch</span>':'')+
    '<span style="font-size:12px;color:var(--muted)">across <b>'+ev.pairs+'</b> store–category pair'+(ev.pairs===1?'':'s')+'</span>'+
    (stores.length?'<span style="font-size:12px;color:var(--muted)">Stores at risk: <b>'+esc(stores.join(', '))+'</b></span>':'')+
    '<button onclick="anSetTab(\'targets\')" style="margin-left:auto;border:0;background:var(--navy);color:#fff;border-radius:7px;padding:6px 12px;font-weight:800;font-size:11.5px;cursor:pointer">Open Targets →</button>'+
    '</div><div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">'+top+'</div></div>';
};

/* ══════════════════════════ TAB 1 — CATEGORY PERFORMANCE ══════════════════════════ */
window.mdAnRenderCategory=function(ctx){
  var agg=ctx.agg,prev=ctx.prev,f=ctx.f,t=ctx.t;
  var CATS=window.MD_AN_CATEGORIES;
  var storeNote=f.store!=='all'?' · '+window.mdAnStoreLabel(f.store):(f.city!=='all'?' · '+f.city:'');

  /* KPI row — one hero figure (order value), then the numbers that qualify it. */
  var h='<div class="an-kpi">'+
    '<div class="an-kpi-hero"><div class="an-kpi-lbl">Category order value'+esc(storeNote)+'</div>'+
      '<div class="an-hero-fig">'+window.mdAnRup(agg.totals.value)+'</div>'+
      '<div class="an-kpi-sub">'+window.mdAnRupFull(agg.totals.value)+' across '+window.mdAnNum(agg.totals.orders)+' category orders'+
      (prev?' · '+window.mdAnDelta(agg.totals.value,prev.totals.value,true)+' vs previous '+ctx.days+' days':'')+'</div></div>'+
    ['orders','carts','convB','customers'].map(function(k){
      var lbl,val,sub;
      if(k==='orders'){lbl='Category orders';val=window.mdAnNum(agg.totals.orders);sub=prev?window.mdAnDelta(agg.totals.orders,prev.totals.orders,true)+' vs prev':'';}
      if(k==='carts'){lbl='Carts';val=window.mdAnNum(agg.totals.carts);sub=(prev?window.mdAnDelta(agg.totals.carts,prev.totals.carts,true)+' vs prev':'')+(f.store!=='all'?' <span style="color:var(--amber)">· allocated</span>':'');}
      if(k==='convB'){lbl='Cart → order conversion';val=window.mdAnPct(agg.totals.convBpct,true);sub='Conv A (cart cleared) '+window.mdAnPct(agg.totals.convApct,true);}
      if(k==='customers'){var cu=0;window.MD_AN_CAT_IDS.forEach(function(c){cu+=agg.cats[c].customers;});lbl='Customers';val=window.mdAnNum(cu);sub='Distinct clients per category, summed';}
      return '<div class="an-kpi-tile"><div class="an-kpi-lbl">'+lbl+'</div><div class="an-kpi-val">'+val+'</div><div class="an-kpi-sub">'+sub+'</div></div>';
    }).join('')+'</div>';

  /* One card per category — small multiples, each card a single-series story. */
  h+='<div class="an-catgrid">';
  window.MD_AN_CAT_IDS.forEach(function(c){
    var C=CATS[c],a=agg.cats[c],p=prev?prev.cats[c]:null;
    var spark=window.mdAnSpark(dailySeries(ctx,c,'orders'),C.color,150,34,C.label+' orders per day');
    var attachTarget=C.attach?window.mdAnRateTarget(t,f,'attach',c):null;
    var attachLevel=(!C.attach||a.attachPct==null||!attachTarget)?'none':(a.attachPct>=attachTarget?'ok':(a.attachPct>=attachTarget*t.warnAtPct/100?'watch':'risk'));
    var convTarget=window.mdAnRateTarget(t,f,'convB',c);
    var convLevel=(a.convBpct==null||!convTarget)?'none':(a.convBpct>=convTarget?'ok':(a.convBpct>=convTarget*t.warnAtPct/100?'watch':'risk'));
    h+='<div class="an-catcard">'+
      '<div class="an-catcard-head"><span style="font-size:17px">'+C.icon+'</span>'+
        '<div><div class="an-catcard-title">'+esc(C.label)+'</div>'+
        '<div class="an-catcard-sub">'+window.mdAnNum(a.customers)+' customers · '+window.mdAnNum1(a.qty)+' '+esc(C.qtyUnit)+'</div></div>'+
        (C.modelled?'<span class="an-badge-mod" title="Not in the source workbook — these figures are modelled">modelled</span>':'')+
        '<div style="margin-left:auto;text-align:right"><div class="an-catcard-val">'+window.mdAnNum(a.orders)+'</div>'+
        '<div class="an-catcard-lbl">orders'+(p?' · '+window.mdAnDelta(a.orders,p.orders,true):'')+'</div></div></div>'+
      '<div class="an-catcard-spark">'+spark+'</div>'+
      '<div class="an-catcard-rows">'+
        '<div><span>Order value</span><b>'+window.mdAnRup(a.value)+'</b></div>'+
        '<div><span>Value / order</span><b>'+window.mdAnRup(a.aov)+'</b></div>'+
        '<div><span>Carts</span><b>'+window.mdAnNum(a.carts)+'</b></div>'+
      '</div>'+
      /* cart funnel — ordered steps of ONE hue, so it reads as a funnel, not as three identities */
      '<div class="an-catcard-block"><div class="an-mini-lbl">Cart funnel'+(f.store!=='all'?' <span style="color:var(--amber)">(store share, allocated)</span>':'')+'</div>'+
        window.mdAnStackBar([{label:'Ordered this category (conv B)',v:a.convB,color:RAMP[5]},
                             {label:'Cart cleared by an order (conv A)',v:Math.max(0,a.cleared-a.convB),color:RAMP[2]},
                             {label:'Still open',v:Math.max(0,a.carts-a.cleared),color:'#e9edf3',ink:'#67748a'}],a.carts,20)+
        '<div class="an-mini-legend"><span><i style="background:'+RAMP[5]+'"></i>Ordered this category '+window.mdAnNum(a.convB)+' · '+window.mdAnPct(a.convBpct,true)+' (conv B)</span>'+
          '<span><i style="background:'+RAMP[2]+'"></i>Cleared by another order '+window.mdAnNum(Math.max(0,a.cleared-a.convB))+' — conv A '+window.mdAnPct(a.convApct,true)+' all in</span>'+
          '<span><i style="background:#e9edf3"></i>Still open '+window.mdAnNum(Math.max(0,a.carts-a.cleared))+'</span></div>'+
        (convTarget?'<div style="margin-top:5px">'+window.mdAnMeter(a.convBpct==null?0:a.convBpct/convTarget*100,convLevel)+
          '<div class="an-mini-foot">'+window.mdAnLevelChip(convLevel)+' <span>target '+window.mdAnPct(convTarget,true)+' conv B</span></div></div>':'')+
      '</div>'+
      (C.attach?'<div class="an-catcard-block"><div class="an-mini-lbl">Installation attach rate</div>'+
        '<div class="an-attach"><b>'+window.mdAnPct(a.attachPct,true)+'</b><span>'+window.mdAnNum(a.attachNum)+' of '+window.mdAnNum(a.attachDen)+' orders also booked installation</span></div>'+
        window.mdAnMeter(a.attachPct,attachLevel)+
        '<div class="an-mini-foot">'+window.mdAnLevelChip(attachLevel)+(attachTarget?' <span>target '+window.mdAnPct(attachTarget,true)+'</span>':'')+
        ' <button class="an-link" onclick="anDrill(\'attach_'+c+'\')">rows ⤢</button></div></div>':'')+
      (c==='site_audit'?'<div class="an-catcard-block"><div class="an-mini-lbl">Site audit → order conversion</div>'+
        window.mdAnStackBar([{label:'Converted — material + installation',v:agg.conv.productInstall,color:RAMP[5]},
                             {label:'Converted — material only, no installation',v:agg.conv.product,color:RAMP[2]},
                             {label:'Not converted yet',v:agg.conv.none,color:'#e9edf3',ink:'#67748a'}],agg.conv.audits,20)+
        '<div class="an-mini-legend"><span><i style="background:'+RAMP[5]+'"></i>+ install '+window.mdAnPct(agg.conv.productInstallPct,true)+'</span>'+
          '<span><i style="background:'+RAMP[2]+'"></i>material only '+window.mdAnPct(agg.conv.productPct,true)+'</span>'+
          '<span><i style="background:#e9edf3"></i>not yet '+window.mdAnNum(agg.conv.none)+'</span></div>'+
        '<div class="an-mini-foot"><b style="color:var(--navy)">'+window.mdAnPct(agg.conv.pct,true)+' converted</b>'+
        (agg.conv.medianTat!=null?' <span>median '+agg.conv.medianTat+' days audit → order</span>':'')+
        ' <button class="an-link" onclick="anDrill(\'auditconv\')">rows ⤢</button></div></div>':'')+
      (C.note?'<div class="an-catcard-note">'+esc(C.note)+'</div>':'')+
      '</div>';
  });
  h+='</div>';

  /* Category × Store matrix — 6 categories × 13 stores is a table's job, not a chart's. */
  var maxOrders=0;
  window.MD_AN_STORE_IDS.forEach(function(s){window.MD_AN_CAT_IDS.forEach(function(c){maxOrders=Math.max(maxOrders,agg.byStore[s][c].orders);});});
  h+='<div class="an-section" style="margin-top:18px"><div class="an-section-head"><span class="an-section-ico">🏬</span>'+
    '<div><div class="an-section-title">Category × Store</div><div class="an-section-sub">Orders (and that category’s order value) per store · '+esc(f.from)+' to '+esc(f.to)+'</div></div>'+
    '<button class="an-csv" onclick="anCsv(\'matrix\')">⬇ CSV</button></div>'+
    '<div style="overflow-x:auto"><table class="an-inst-table an-matrix"><thead><tr><th>Store</th>'+
    window.MD_AN_CAT_IDS.map(function(c){return '<th style="text-align:right">'+CATS[c].icon+' '+esc(CATS[c].short)+'</th>';}).join('')+
    '<th style="text-align:right">Total value</th></tr></thead><tbody>';
  var shown=0;
  window.MD_AN_STORE_IDS.forEach(function(s){
    if(!storeMatch(s,f))return;
    var row=agg.byStore[s], any=window.MD_AN_CAT_IDS.some(function(c){return row[c].orders>0;});
    if(!any)return;
    shown++;
    var tv=window.MD_AN_CAT_IDS.reduce(function(x,c){return x+row[c].value;},0);
    h+='<tr><td style="font-weight:700;white-space:nowrap">'+esc(window.mdAnStoreLabel(s))+
      '<small>'+esc(window.MD_AN_STORES[s].city)+' · '+esc(window.MD_AN_STORES[s].status)+'</small></td>'+
      window.MD_AN_CAT_IDS.map(function(c){
        var cell=row[c], hp=window.mdAnHeat(cell.orders,maxOrders);
        return '<td style="text-align:right;padding:0"><div title="'+esc(CATS[c].label+' · '+window.mdAnStoreLabel(s)+': '+cell.orders+' orders, '+window.mdAnRupFull(cell.value))+'"'+
          ' style="background:'+hp.bg+';color:'+hp.fg+';padding:9px 12px;font-weight:700">'+(cell.orders||'—')+
          (cell.orders?'<div style="font-size:10px;font-weight:600;opacity:.85">'+window.mdAnRup(cell.value)+'</div>':'')+'</div></td>';
      }).join('')+
      '<td style="text-align:right;font-weight:800">'+window.mdAnRup(tv)+'</td></tr>';
  });
  if(!shown)h+='<tr><td colspan="'+(window.MD_AN_CAT_IDS.length+2)+'" style="padding:18px;text-align:center;color:var(--muted)">No orders in this range for the selected store/city.</td></tr>';
  h+='<tr style="border-top:2px solid var(--line)"><td style="font-weight:800">All stores</td>'+
    window.MD_AN_CAT_IDS.map(function(c){return '<td style="text-align:right;font-weight:800">'+window.mdAnNum(agg.cats[c].orders)+'<div style="font-size:10px;color:var(--muted);font-weight:600">'+window.mdAnRup(agg.cats[c].value)+'</div></td>';}).join('')+
    '<td style="text-align:right;font-weight:900">'+window.mdAnRup(agg.totals.value)+'</td></tr>';
  h+='</tbody></table></div>'+
    '<div class="an-scale"><span>Fewer orders</span>'+RAMP.map(function(c){return '<i style="background:'+c+'"></i>';}).join('')+'<span>More</span>'+
    '<span style="margin-left:auto;color:var(--muted)">Cell shade = orders, relative to the busiest store/category cell in this range. The number is always printed.</span></div></div>';

  /* Cart funnel table — the table twin of every funnel bar above. */
  h+='<div class="an-section"><div class="an-section-head"><span class="an-section-ico">🛒</span>'+
    '<div><div class="an-section-title">Cart funnel</div><div class="an-section-sub">Conv A = cart cleared by an order · Conv B = that customer ordered THIS category. B is the one to steer by.</div></div>'+
    '<button class="an-csv" onclick="anCsv(\'carts\')">⬇ CSV</button></div>'+
    '<div style="overflow-x:auto"><table class="an-inst-table"><thead><tr><th>Category</th><th style="text-align:right">Carts</th>'+
    '<th style="text-align:right">Carts / day</th><th style="text-align:right">Cleared</th><th style="text-align:right">Conv A %</th>'+
    '<th style="text-align:right">Ordered same cat.</th><th style="text-align:right">Conv B %</th><th style="text-align:right">Orders</th>'+
    '<th style="text-align:right">Carts per order</th></tr></thead><tbody>'+
    window.MD_AN_CAT_IDS.map(function(c){
      var a=agg.cats[c];
      return '<tr><td style="font-weight:700">'+CATS[c].icon+' '+esc(CATS[c].label)+(CATS[c].modelled?' <span class="an-badge-mod">modelled</span>':'')+'</td>'+
        '<td style="text-align:right">'+window.mdAnNum(a.carts)+'</td>'+
        '<td style="text-align:right;color:var(--muted)">'+window.mdAnNum1(a.carts/ctx.days)+'</td>'+
        '<td style="text-align:right">'+window.mdAnNum(a.cleared)+'</td>'+
        '<td style="text-align:right">'+window.mdAnPct(a.convApct,true)+'</td>'+
        '<td style="text-align:right">'+window.mdAnNum(a.convB)+'</td>'+
        '<td style="text-align:right;font-weight:700">'+window.mdAnPct(a.convBpct,true)+'</td>'+
        '<td style="text-align:right">'+window.mdAnNum(a.orders)+'</td>'+
        '<td style="text-align:right;color:var(--muted)">'+(a.convB?window.mdAnNum1(a.carts/a.convB):'—')+'</td></tr>';
    }).join('')+
    '</tbody></table></div></div>';

  /* drill-downs published for this tab */
  window.MD_AN_CAT_IDS.forEach(function(c){
    if(!CATS[c].attach)return;
    var rows=[];
    ctx.ds.orders.forEach(function(o){
      if(!inRange(o.date,f)||!storeMatch(o.store,f))return;
      if(!o.lines.some(function(l){return l.cat===c;}))return;
      var v=o.lines.filter(function(l){return l.cat===c;}).reduce(function(s,l){return s+l.value;},0);
      rows.push([o.id,o.date,window.mdAnStoreLabel(o.store),o.client,window.mdAnRupFull(v),o.hasInstall?'✓ Installation attached':'✗ No installation']);
    });
    window.mdAnSetDrill('attach_'+c,{title:CATS[c].label+' — installation attach rate',
      note:'Every order in this range containing '+CATS[c].label+'. “Attached” means the same order also carries an installation line — checked both as any-installation and as category-matched installation, which the workbook found identical in every store-month.',
      cols:['Order','Date','Store','Customer','Category value','Attach'],rows:rows});
  });
  window.mdAnSetDrill('auditconv',{title:'Site audit → order conversion',
    note:'One row per site audit booked in this range, judged per audit (never “has this phone ever ordered”). Conversion counts whenever the order lands, even after the range ends. “Material only” means that customer bought the product but did NOT take installation from us.',
    cols:['Audit order','Audit date','Store','Customer','Outcome','Converted order','Order date','TAT (days)'],
    rows:agg.auditRows.map(function(r){
      return [r.pi,r.date,window.mdAnStoreLabel(r.store),r.client,
        r.kind==='product_install'?'✓ Material + installation':r.kind==='product'?'✓ Material only ('+r.cats+')':'✗ Not converted yet',
        r.link||'—',r.linkDate||'—',r.tat==null?'—':r.tat];
    })});

  return h;
};

/* ══════════════════════════ TAB 2 — WEEK ON WEEK ══════════════════════════ */
window.mdAnRenderWeekly=function(ctx){
  var f=ctx.f,ds=ctx.ds,t=ctx.t,CATS=window.MD_AN_CATEGORIES;
  var weeks=window.mdAnWeeks(f);
  if(!weeks.length)return '<div class="an-na-note">Pick a date range to compare weeks.</div>';
  // one aggregate per week, computed once and shared by the charts and the tables
  var W=weeks.map(function(w){
    var wf={from:w.from,to:w.to,store:f.store,city:f.city};
    return {w:w,agg:window.mdAnAggregate(ds,wf)};
  });
  var partial=W.filter(function(x){return x.w.partial;});
  var h='<div class="an-note-row">Weeks are anchored on the month — W1 = 1–7, W2 = 8–14, W3 = 15–21, W4 = 22–28, W5 = 29–end — exactly like the workbook’s weekly tab, so these rows are directly comparable to it.'+
    (partial.length?' <b>'+partial.map(function(x){return x.w.label+' covers '+x.w.days+' day'+(x.w.days===1?'':'s');}).join(', ')+'</b> — compare the per-day columns, not the raw counts. A short week’s conversion also looks weak because its carts had almost no time to convert before the range ended.':'')+'</div>';

  window.MD_AN_CAT_IDS.forEach(function(c){
    var C=CATS[c];
    var rows=W.map(function(x){return x.agg.cats[c];});
    if(!rows.some(function(r){return r.orders||r.carts;}))return;
    var cols=W.map(function(x,i){return {label:x.w.label,short:'W'+(i+1),v:x.agg.cats[c].orders,dim:x.w.partial};});
    var cartCols=W.map(function(x,i){return {label:x.w.label+' carts',short:'W'+(i+1),v:x.agg.cats[c].carts,dim:x.w.partial};});
    h+='<div class="an-section"><div class="an-section-head"><span class="an-section-ico">'+C.icon+'</span>'+
      '<div><div class="an-section-title">'+esc(C.label)+(C.modelled?' <span class="an-badge-mod">modelled</span>':'')+'</div>'+
      '<div class="an-section-sub">Week on week · '+esc(f.from)+' to '+esc(f.to)+'</div></div></div>'+
      '<div class="an-wow-charts">'+
        '<figure class="an-fig"><figcaption>Orders per week</figcaption>'+window.mdAnColumns(cols,C.color,260,110)+'</figure>'+
        '<figure class="an-fig"><figcaption>Carts per week'+(f.store!=='all'?' (allocated)':'')+'</figcaption>'+window.mdAnColumns(cartCols,RAMP[3],260,110)+'</figure>'+
      '</div>'+
      '<div style="overflow-x:auto"><table class="an-inst-table"><thead><tr><th>Week</th><th style="text-align:right">Days</th>'+
      '<th style="text-align:right">Carts</th><th style="text-align:right">/day</th><th style="text-align:right">Conv A %</th><th style="text-align:right">Conv B %</th>'+
      '<th style="text-align:right">Orders</th><th style="text-align:right">/day</th><th style="text-align:right">Order value</th><th style="text-align:right">Value / order</th>'+
      (C.attach?'<th style="text-align:right">Attach %</th>':'')+
      (c==='site_audit'?'<th style="text-align:right">Audit → order %</th>':'')+'</tr></thead><tbody>';
    W.forEach(function(x,i){
      var a=x.agg.cats[c],p=i?W[i-1].agg.cats[c]:null;
      var pd=function(cur,pr,good){return p?' '+window.mdAnDelta(cur,pr,good):'';};  // pass real nulls through — mdAnDelta renders nothing for them
      h+='<tr'+(x.w.partial?' style="background:#fcfcf7"':'')+'><td style="font-weight:700;white-space:nowrap">'+esc(x.w.label)+(x.w.partial?'<small>partial week</small>':'')+'</td>'+
        '<td style="text-align:right;color:var(--muted)">'+x.w.days+'</td>'+
        '<td style="text-align:right">'+window.mdAnNum(a.carts)+'</td>'+
        '<td style="text-align:right;font-weight:700">'+window.mdAnNum1(a.carts/x.w.days)+(p?' '+window.mdAnDelta(a.carts/x.w.days,p.carts/W[i-1].w.days,true):'')+'</td>'+
        '<td style="text-align:right">'+window.mdAnPct(a.convApct,true)+'</td>'+
        '<td style="text-align:right;font-weight:700">'+window.mdAnPct(a.convBpct,true)+pd(a.convBpct,p?p.convBpct:null,true)+'</td>'+
        '<td style="text-align:right">'+window.mdAnNum(a.orders)+'</td>'+
        '<td style="text-align:right;font-weight:700">'+window.mdAnNum1(a.orders/x.w.days)+(p?' '+window.mdAnDelta(a.orders/x.w.days,p.orders/W[i-1].w.days,true):'')+'</td>'+
        '<td style="text-align:right">'+window.mdAnRup(a.value)+'</td>'+
        '<td style="text-align:right;color:var(--muted)">'+window.mdAnRup(a.aov)+'</td>'+
        (C.attach?'<td style="text-align:right">'+window.mdAnPct(a.attachPct,true)+pd(a.attachPct,p?p.attachPct:null,true)+'</td>':'')+
        (c==='site_audit'?'<td style="text-align:right">'+window.mdAnPct(x.agg.conv.pct,true)+'<small>'+x.agg.conv.converted+' of '+x.agg.conv.audits+'</small></td>':'')+
        '</tr>';
    });
    h+='</tbody></table></div></div>';
  });
  h+='<div style="display:flex;justify-content:flex-end;margin-top:-8px"><button class="an-csv" onclick="anCsv(\'weekly\')">⬇ Download week-on-week CSV</button></div>';
  return h;
};

/* ══════════════════════════ TAB 3 — STORE & CATEGORY PENETRATION ══════════════════════════ */
window.mdAnRenderPenetration=function(ctx){
  var f=ctx.f,CATS=window.MD_AN_CATEGORIES,pen=ctx.pen;
  var live=pen.filter(function(p){return p.totalOrders>0;});
  var maxPen=0;live.forEach(function(p){window.MD_AN_CAT_IDS.forEach(function(c){if(p.cats[c].pct!=null)maxPen=Math.max(maxPen,p.cats[c].pct);});});
  // mature-store benchmark: the average penetration of the stores the workbook calls mature. It is
  // the yardstick a 1-month-old store is judged against, because penetration is size-independent.
  var mature=live.filter(function(p){return p.status==='mature';});
  var bench={};window.MD_AN_CAT_IDS.forEach(function(c){
    var vs=mature.map(function(p){return p.cats[c].pct;}).filter(function(v){return v!=null;});
    bench[c]=vs.length?vs.reduce(function(a,b){return a+b;},0)/vs.length:null;
  });
  var inexact=live.some(function(p){return !p.exact;});

  var h='<div class="an-note-row"><b>Penetration = that category’s orders ÷ the store’s total confirmed orders (all categories) in the same window.</b> '+
    'This is the metric that travels to a new store: it does not care that JP Nagar is 40 months old and HSR Layout is 1 month old, so it is the honest way to say “Gachibowli under-sells installation”. '+
    (inexact?'The selected range is not a whole month, so each store’s total order count is pro-rated across the days covered — directional, not exact.':'')+'</div>';

  h+='<div class="an-section"><div class="an-section-head"><span class="an-section-ico">🏬</span>'+
    '<div><div class="an-section-title">Store maturity &amp; category penetration</div>'+
    '<div class="an-section-sub">'+esc(f.from)+' to '+esc(f.to)+' · '+live.length+' store'+(live.length===1?'':'s')+' with orders</div></div>'+
    '<button class="an-csv" onclick="anCsv(\'penetration\')">⬇ CSV</button></div>'+
    '<div style="overflow-x:auto"><table class="an-inst-table an-matrix"><thead><tr>'+
    '<th>Store</th><th style="text-align:right">Opened</th><th style="text-align:right">Months live</th>'+
    '<th style="text-align:right">Total orders<small>all categories</small></th>'+
    window.MD_AN_CAT_IDS.map(function(c){return '<th style="text-align:right">'+CATS[c].icon+' '+esc(CATS[c].short)+'<small>penetration</small></th>';}).join('')+
    '<th style="text-align:right">These 6<small>share of order book</small></th></tr></thead><tbody>';
  live.sort(function(a,b){return b.totalOrders-a.totalOrders;}).forEach(function(p){
    h+='<tr><td style="font-weight:700;white-space:nowrap">'+esc(p.label)+'<small>'+esc(p.city)+' · '+esc(p.status)+(p.kind==='channel'?' (channel, not a store)':'')+'</small></td>'+
      '<td style="text-align:right;color:var(--muted)">'+esc(p.opened)+'</td>'+
      '<td style="text-align:right">'+window.mdAnNum1(p.monthsLive)+'</td>'+
      '<td style="text-align:right;font-weight:700">'+window.mdAnNum(p.totalOrders)+(p.exact?'':'<small>pro-rated</small>')+'</td>'+
      window.MD_AN_CAT_IDS.map(function(c){
        var cell=p.cats[c],hp=window.mdAnHeat(cell.pct,maxPen);
        var vs=bench[c]!=null&&cell.pct!=null?cell.pct/bench[c]:null;
        return '<td style="text-align:right;padding:0"><div title="'+esc(p.label+' · '+CATS[c].label+': '+cell.orders+' orders = '+window.mdAnPct(cell.pct,true)+' of the store’s order book'+(vs!=null?' · '+Math.round(vs*100)+'% of the mature-store benchmark':''))+'"'+
          ' style="background:'+hp.bg+';color:'+hp.fg+';padding:9px 10px;font-weight:700">'+window.mdAnPct(cell.pct,true)+
          '<div style="font-size:10px;font-weight:600;opacity:.85">'+cell.orders+' ord</div></div></td>';
      }).join('')+
      '<td style="text-align:right;font-weight:800">'+window.mdAnPct(p.sharePct,true)+'</td></tr>';
  });
  h+='<tr style="border-top:2px solid var(--line)"><td style="font-weight:800">Mature-store benchmark<small>average of '+esc(mature.map(function(p){return p.label;}).join(', ')||'—')+'</small></td>'+
    '<td></td><td></td><td></td>'+
    window.MD_AN_CAT_IDS.map(function(c){return '<td style="text-align:right;font-weight:800">'+window.mdAnPct(bench[c],true)+'</td>';}).join('')+'<td></td></tr>'+
    '</tbody></table></div>'+
    '<div class="an-scale"><span>Lower penetration</span>'+RAMP.map(function(c){return '<i style="background:'+c+'"></i>';}).join('')+'<span>Higher</span>'+
    '<span style="margin-left:auto;color:var(--muted)">Shade = penetration relative to the highest cell in this range. The % and the order count are always printed.</span></div></div>';

  /* Gap callouts — computed, not hand-written: a real store running under half the mature-store
     benchmark in a category with enough volume to judge. */
  var gaps=[];
  live.forEach(function(p){
    if(p.kind==='channel'||p.status==='planned')return;
    window.MD_AN_CAT_IDS.forEach(function(c){
      if(bench[c]==null||bench[c]<=0||p.status==='mature')return;
      var v=p.cats[c].pct;if(v==null||p.totalOrders<40)return;
      var ratio=v/bench[c];
      if(ratio<0.5&&Math.round((bench[c]-v)/100*p.totalOrders)>=1)gaps.push({store:p.label,cat:CATS[c].label,pct:v,bench:bench[c],ratio:ratio,
        missing:Math.max(0,Math.round((bench[c]-v)/100*p.totalOrders))});
    });
  });
  gaps.sort(function(a,b){return a.ratio-b.ratio;});
  if(gaps.length)h+='<div class="an-section"><div class="an-section-head"><span class="an-section-ico">🔎</span>'+
    '<div><div class="an-section-title">Penetration gaps</div><div class="an-section-sub">Ramping stores running below half the mature-store benchmark, with at least 40 orders to judge on</div></div></div>'+
    '<div style="padding:12px 18px;display:flex;flex-wrap:wrap;gap:8px">'+
    gaps.slice(0,12).map(function(g){return '<div class="an-gap"><b>'+esc(g.store)+'</b> · '+esc(g.cat)+
      '<div>'+window.mdAnPct(g.pct,true)+' vs benchmark '+window.mdAnPct(g.bench,true)+
      '<span> — about '+g.missing+' order'+(g.missing===1?'':'s')+' of upside in this range</span></div></div>';}).join('')+
    '</div></div>';
  return h;
};

/* ══════════════════════════ TAB 4 — TARGETS & WARNINGS ══════════════════════════ */
window.mdAnRenderTargets=function(ctx,editMonth){
  var f=ctx.f,t=ctx.t,ev=ctx.ev,CATS=window.MD_AN_CATEGORIES;
  editMonth=editMonth||(f.to.slice(0,7)>='2026-06'&&t.orders[f.to.slice(0,7)]?f.to.slice(0,7):'2026-08');
  var MONTHL=function(m){var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return MON[+m.slice(5,7)-1]+'-'+m.slice(2,4);};

  /* --- A. achievement against the selected range --- */
  var h='<div class="an-note-row"><b>How this is judged:</b> a target is a full-month number, so the selected range is compared against the same fraction of it — '+
    'a 17-day window is measured against 17/31 of the month’s target, never against the whole month. '+
    'Revenue target = orders target × value per order. Carts target = orders target ÷ the cart-conversion-B target. '+
    'Rate metrics (cart conversion, attach) are only judged where there is enough volume to mean anything (≥10 carts / ≥5 orders). '+
    'Stores that have not opened yet are skipped, not failed.</div>';
  h+=window.mdAnWarnBanner(ctx);

  var groups=[{k:'risk',title:'At risk',sub:'below '+t.warnAtPct+'% of the pro-rated target'},
              {k:'watch',title:'Watch',sub:t.warnAtPct+'–99% of target'}];
  groups.forEach(function(g){
    var rows=ev[g.k];
    var L=window.MD_AN_LEVELS[g.k];
    h+='<div class="an-section"><div class="an-section-head"><span class="an-section-ico">'+L.ico+'</span>'+
      '<div><div class="an-section-title" style="color:'+L.col+'">'+g.title+'</div><div class="an-section-sub">'+esc(g.sub)+' · '+esc(f.from)+' to '+esc(f.to)+'</div></div>'+
      '<div class="an-hero"><div class="an-hero-val" style="color:'+L.col+'">'+rows.length+'</div><div class="an-hero-label">checks</div></div></div>';
    if(!rows.length)h+='<div class="an-na-note">Nothing '+g.title.toLowerCase()+' in this range.</div>';
    else{
      h+='<div style="overflow-x:auto"><table class="an-inst-table"><thead><tr><th>Scope</th><th>Store</th><th>Category</th><th>Metric</th>'+
        '<th style="text-align:right">Actual</th><th style="text-align:right">Target</th><th style="text-align:right">Achieved</th><th style="width:120px">&nbsp;</th></tr></thead><tbody>';
      rows.slice(0,60).forEach(function(r){
        var fmt=r.unit==='₹'?window.mdAnRup:(r.unit==='%'?function(v){return window.mdAnPct(v,true);}:window.mdAnNum);
        h+='<tr><td style="color:var(--muted);font-size:11px">'+(r.scope==='company'?'Company':'Store')+'</td>'+
          '<td style="font-weight:700">'+esc(r.storeLabel)+'</td><td>'+esc(r.catLabel)+'</td><td>'+esc(r.metric)+'</td>'+
          '<td style="text-align:right;font-weight:700">'+fmt(r.actual)+'</td>'+
          '<td style="text-align:right;color:var(--muted)">'+fmt(r.target)+'</td>'+
          '<td style="text-align:right;font-weight:800;color:'+window.MD_AN_LEVELS[r.level].col+'">'+Math.round(r.pct)+'%</td>'+
          '<td>'+window.mdAnMeter(r.pct,r.level)+'</td></tr>';
      });
      h+='</tbody></table></div>';
      if(rows.length>60)h+='<div class="an-na-note">Showing the worst 60 of '+rows.length+' — download the CSV for all of them.</div>';
    }
    h+='</div>';
  });
  h+='<details class="an-section" style="padding:0"><summary class="an-section-head" style="cursor:pointer;list-style:none">'+
    '<span class="an-section-ico">✓</span><div><div class="an-section-title">Everything on target</div>'+
    '<div class="an-section-sub">'+ev.all.filter(function(r){return r.level==='ok';}).length+' checks at or above target — click to expand</div></div></summary>'+
    '<div style="overflow-x:auto"><table class="an-inst-table"><thead><tr><th>Store</th><th>Category</th><th>Metric</th>'+
    '<th style="text-align:right">Actual</th><th style="text-align:right">Target</th><th style="text-align:right">Achieved</th></tr></thead><tbody>'+
    ev.all.filter(function(r){return r.level==='ok';}).sort(function(a,b){return b.pct-a.pct;}).map(function(r){
      var fmt=r.unit==='₹'?window.mdAnRup:(r.unit==='%'?function(v){return window.mdAnPct(v,true);}:window.mdAnNum);
      return '<tr><td style="font-weight:700">'+esc(r.storeLabel)+'</td><td>'+esc(r.catLabel)+'</td><td>'+esc(r.metric)+'</td>'+
        '<td style="text-align:right;font-weight:700">'+fmt(r.actual)+'</td><td style="text-align:right;color:var(--muted)">'+fmt(r.target)+'</td>'+
        '<td style="text-align:right;font-weight:800;color:var(--green)">'+Math.round(r.pct)+'%</td></tr>';
    }).join('')+'</tbody></table></div></details>';

  /* --- B. the editable target sheet --- */
  var om=t.orders[editMonth]||{};
  h+='<div class="an-section"><div class="an-section-head"><span class="an-section-ico">🎯</span>'+
    '<div><div class="an-section-title">Set targets</div><div class="an-section-sub">'+
    'Orders per store per category. Revenue and cart targets are derived, so there is one number to argue about per cell.</div></div>'+
    '<div style="margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'+
      '<label style="font-size:11px;font-weight:800;color:var(--muted)">MONTH</label>'+
      '<select class="an-date-inp" onchange="anTargetMonth(this.value)">'+
      window.MD_AN_TARGET_MONTHS.map(function(m){return '<option value="'+m+'"'+(m===editMonth?' selected':'')+'>'+MONTHL(m)+'</option>';}).join('')+'</select>'+
      '<label style="font-size:11px;font-weight:800;color:var(--muted)">WARN BELOW</label>'+
      '<input type="number" min="1" max="100" value="'+t.warnAtPct+'" class="an-date-inp" style="width:70px" onchange="anTargetWarnAt(this)">'+
      '<span style="font-size:11px;color:var(--muted)">% of target</span>'+
      '<button class="an-csv" onclick="anCsv(\'targets\')">⬇ CSV</button>'+
      '<button onclick="anSaveTargets()" style="border:0;background:var(--green);color:#fff;border-radius:7px;padding:7px 14px;font-weight:800;font-size:12px;cursor:pointer">Save targets</button>'+
      '<button onclick="anResetTargets()" class="filt-btn">Reset to plan</button>'+
    '</div></div>'+
    '<div style="padding:10px 18px;font-size:11.5px;color:var(--muted);border-bottom:1px solid var(--line)">'+esc(t.note)+
      (t.savedAt?' <b style="color:var(--green)">Last saved '+esc(String(t.savedAt).replace('T',' ').slice(0,16))+(t.savedBy?' by '+esc(t.savedBy):'')+'.</b>':' <b>Not saved yet — these are the seeded plan numbers.</b>')+'</div>'+
    '<div style="overflow-x:auto"><table class="an-inst-table an-tgt"><thead><tr><th>Store</th>'+
    window.MD_AN_CAT_IDS.map(function(c){return '<th style="text-align:right">'+CATS[c].icon+' '+esc(CATS[c].short)+(c==='installation'?'<small>derived</small>':'<small>orders</small>')+'</th>';}).join('')+
    '<th style="text-align:right">Total orders</th><th style="text-align:right">Revenue target</th></tr></thead><tbody>';
  window.MD_AN_STORE_IDS.forEach(function(s){
    var row=om[s]||{},tot=0,rev=0;
    window.MD_AN_CAT_IDS.forEach(function(c){tot+=row[c]||0;rev+=(row[c]||0)*(t.aov[c]||0);});
    var st=window.MD_AN_STORES[s];
    h+='<tr><td style="font-weight:700;white-space:nowrap">'+esc(st.label)+'<small>'+esc(st.status)+(st.status==='planned'?' · opens '+esc(st.opened.slice(0,7)):'')+'</small></td>'+
      window.MD_AN_CAT_IDS.map(function(c){
        if(c==='installation')return '<td style="text-align:right;color:var(--muted)" title="Derived from this store’s wallpaper/flooring/panel/CNC plan × the attach-rate target, plus other installation at 4.575%">'+window.mdAnNum(row[c])+'</td>';
        return '<td style="text-align:right;padding:4px 6px"><input type="number" min="0" step="1" value="'+(row[c]||0)+'" class="an-tgt-inp" onchange="anTargetInput(\''+editMonth+'\',\''+s+'\',\''+c+'\',this)"></td>';
      }).join('')+
      '<td style="text-align:right;font-weight:800">'+window.mdAnNum(tot)+'</td>'+
      '<td style="text-align:right;font-weight:700">'+window.mdAnRup(rev)+'</td></tr>';
  });
  h+='</tbody></table></div>'+
    '<div class="an-sub-head">Rate targets — '+MONTHL(editMonth)+'</div>'+
    '<div style="overflow-x:auto"><table class="an-inst-table"><thead><tr><th>Category</th>'+
    '<th style="text-align:right">Cart conversion B %</th><th style="text-align:right">Installation attach %</th>'+
    '<th style="text-align:right">Value per order (₹)</th><th style="text-align:right">Implied carts</th></tr></thead><tbody>'+
    window.MD_AN_CAT_IDS.map(function(c){
      var conv=(t.convB[editMonth]||{})[c],att=(t.attach[editMonth]||{})[c];
      var ordersTot=0;window.MD_AN_STORE_IDS.forEach(function(s){ordersTot+=((om[s]||{})[c]||0);});
      return '<tr><td style="font-weight:700">'+CATS[c].icon+' '+esc(CATS[c].label)+'</td>'+
        '<td style="text-align:right;padding:4px 6px">'+(conv==null?'—':'<input type="number" min="0" max="100" step="0.01" value="'+conv+'" class="an-tgt-inp" onchange="anTargetRate(\'convB\',\''+editMonth+'\',\''+c+'\',this)">')+'</td>'+
        '<td style="text-align:right;padding:4px 6px">'+(att==null?'<span style="color:var(--muted)">n/a</span>':'<input type="number" min="0" max="100" step="0.01" value="'+att+'" class="an-tgt-inp" onchange="anTargetRate(\'attach\',\''+editMonth+'\',\''+c+'\',this)">')+'</td>'+
        '<td style="text-align:right;padding:4px 6px"><input type="number" min="0" step="1" value="'+Math.round(t.aov[c])+'" class="an-tgt-inp" style="width:92px" onchange="anTargetAov(\''+c+'\',this)"></td>'+
        '<td style="text-align:right;color:var(--muted)" title="Orders target ÷ cart conversion B target">'+(conv?window.mdAnNum(ordersTot/(conv/100)):'—')+'</td></tr>';
    }).join('')+
    '<tr style="border-top:2px solid var(--line)"><td style="font-weight:800">Site audit → order conversion %</td>'+
    '<td style="text-align:right;padding:4px 6px" colspan="4"><input type="number" min="0" max="100" step="0.1" value="'+t.auditConv[editMonth]+'" class="an-tgt-inp" onchange="anTargetRate(\'auditConv\',\''+editMonth+'\',\'\',this)">'+
    '<span style="font-size:11px;color:var(--muted);margin-left:8px">Company-wide. Not in the workbook — the phone-level join does not exist there yet, so this one is a judgement call.</span></td></tr>'+
    '</tbody></table></div></div>';
  return h;
};

/* ══════════════════════════════════════════════════════════════════════════════════════════
   10. CSV EXPORTS — every table on screen is downloadable, so nothing is trapped in the UI.
   ══════════════════════════════════════════════════════════════════════════════════════════ */
window.mdAnCsvData=function(key,ctx,editMonth){
  var CATS=window.MD_AN_CATEGORIES,f=ctx.f,agg=ctx.agg,t=ctx.t;
  var stamp=f.from+'_to_'+f.to;
  if(key==='matrix'){
    var rows=[['Store','City','Status','Category','Orders','Order value (INR)','Quantity','Customers','Carts','Conv A %','Conv B %','Attach %']];
    window.MD_AN_STORE_IDS.forEach(function(s){
      if(!storeMatch(s,f))return;
      window.MD_AN_CAT_IDS.forEach(function(c){
        var a=agg.byStore[s][c];if(!a.orders&&!a.carts)return;
        rows.push([window.mdAnStoreLabel(s),window.MD_AN_STORES[s].city,window.MD_AN_STORES[s].status,CATS[c].label,
          a.orders,Math.round(a.value),Math.round(a.qty*10)/10,a.customers,a.carts,
          a.convApct==null?'':Math.round(a.convApct*10)/10,a.convBpct==null?'':Math.round(a.convBpct*10)/10,
          a.attachPct==null?'':Math.round(a.attachPct*10)/10]);
      });
    });
    return {name:'category_by_store_'+stamp,rows:rows};
  }
  if(key==='carts'){
    var r2=[['Category','Carts','Carts per day','Cleared (conv A)','Conv A %','Ordered same category (conv B)','Conv B %','Orders','Carts per order','Order value (INR)']];
    window.MD_AN_CAT_IDS.forEach(function(c){
      var a=agg.cats[c];
      r2.push([CATS[c].label,a.carts,Math.round(a.carts/ctx.days*10)/10,a.cleared,
        a.convApct==null?'':Math.round(a.convApct*10)/10,a.convB,a.convBpct==null?'':Math.round(a.convBpct*10)/10,
        a.orders,a.convB?Math.round(a.carts/a.convB*10)/10:'',Math.round(a.value)]);
    });
    return {name:'cart_funnel_'+stamp,rows:r2};
  }
  if(key==='weekly'){
    var r3=[['Week','From','To','Days','Partial week','Category','Carts','Carts per day','Conv A %','Conv B %','Orders','Orders per day','Order value (INR)','Value per order (INR)','Attach %','Audit to order %']];
    window.mdAnWeeks(f).forEach(function(w){
      var wa=window.mdAnAggregate(ctx.ds,{from:w.from,to:w.to,store:f.store,city:f.city});
      window.MD_AN_CAT_IDS.forEach(function(c){
        var a=wa.cats[c];if(!a.orders&&!a.carts)return;
        r3.push([w.label,w.from,w.to,w.days,w.partial?'yes':'no',CATS[c].label,a.carts,Math.round(a.carts/w.days*10)/10,
          a.convApct==null?'':Math.round(a.convApct*10)/10,a.convBpct==null?'':Math.round(a.convBpct*10)/10,
          a.orders,Math.round(a.orders/w.days*10)/10,Math.round(a.value),Math.round(a.aov),
          a.attachPct==null?'':Math.round(a.attachPct*10)/10,
          c==='site_audit'&&wa.conv.pct!=null?Math.round(wa.conv.pct*10)/10:'']);
      });
    });
    return {name:'week_on_week_'+stamp,rows:r3};
  }
  if(key==='penetration'){
    var r4=[['Store','City','Status','Opened','Months live','Total orders (all categories)','Pro-rated total']];
    window.MD_AN_CAT_IDS.forEach(function(c){r4[0].push(CATS[c].label+' orders',CATS[c].label+' penetration %');});
    r4[0].push('Tracked categories share %');
    ctx.pen.forEach(function(p){
      if(!p.totalOrders)return;
      var row=[p.label,p.city,p.status,p.opened,p.monthsLive,p.totalOrders,p.exact?'no':'yes'];
      window.MD_AN_CAT_IDS.forEach(function(c){row.push(p.cats[c].orders,p.cats[c].pct==null?'':Math.round(p.cats[c].pct*100)/100);});
      row.push(p.sharePct==null?'':Math.round(p.sharePct*100)/100);
      r4.push(row);
    });
    return {name:'store_penetration_'+stamp,rows:r4};
  }
  if(key==='targets'){
    var r5=[['Scope','Store','Category','Metric','Actual','Target (pro-rated to range)','Achieved %','Status']];
    ctx.ev.all.sort(function(a,b){return a.pct-b.pct;}).forEach(function(r){
      r5.push([r.scope,r.storeLabel,r.catLabel,r.metric,
        Math.round(r.actual*100)/100,Math.round(r.target*100)/100,Math.round(r.pct),window.MD_AN_LEVELS[r.level].word]);
    });
    r5.push([]);r5.push(['Monthly target sheet']);
    r5.push(['Month','Store','Category','Orders target','Value per order (INR)','Revenue target (INR)','Cart conversion B % target','Attach % target']);
    window.MD_AN_TARGET_MONTHS.forEach(function(m){
      window.MD_AN_STORE_IDS.forEach(function(s){
        window.MD_AN_CAT_IDS.forEach(function(c){
          var n=((t.orders[m]||{})[s]||{})[c]||0;if(!n)return;
          r5.push([m,window.mdAnStoreLabel(s),CATS[c].label,n,Math.round(t.aov[c]),Math.round(n*t.aov[c]),
            (t.convB[m]||{})[c]==null?'':(t.convB[m]||{})[c],(t.attach[m]||{})[c]==null?'':(t.attach[m]||{})[c]]);
        });
      });
    });
    return {name:'targets_'+stamp,rows:r5};
  }
  return null;
};

/* Tab definitions — the host page renders the bar; 'execution' is Admin.html's own (ops DB) tab. */
window.MD_AN_TABS=[
  {k:'category',  ico:'📦', label:'Category',    sub:'Carts, orders, value, attach rate, audit conversion'},
  {k:'execution', ico:'🔧', label:'Execution',   sub:'Bookings, executions, TAT, arrival on time, NPS'},
  {k:'weekly',    ico:'📈', label:'Week on week', sub:'Every category, week by week'},
  {k:'penetration',ico:'🏬',label:'Penetration', sub:'Store maturity and category penetration'},
  {k:'targets',   ico:'🎯', label:'Targets',     sub:'Set targets and see what is failing'}
];

/* ══════════════════════════════════════════════════════════════════════════════════════════
   11. SHARED PRIMITIVES FOR THE EXECUTION TAB (bookings vs executions, TAT)
   Those metrics come from the OPS database (Supabase), not from this file's dataset — Admin.html
   computes the rows and calls these to draw them, so both halves of the Analytics tab look alike.
   ══════════════════════════════════════════════════════════════════════════════════════════ */
/* Buckets a date range into columns a chart can actually carry: days for a short range, month-
   anchored weeks for a medium one, months beyond that. Never more than ~14 columns. */
window.mdAnBuckets=function(from,to){
  if(!from||!to||isNaN(new Date(from))||isNaN(new Date(to))||from>to)return [];
  var days=Math.round((new Date(to)-new Date(from))/86400000)+1;
  var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if(days<=14){
    var out=[],cur=from;
    while(cur<=to){
      out.push({key:cur,label:(+cur.slice(8,10))+' '+MON[+cur.slice(5,7)-1],short:cur.slice(8,10),from:cur,to:cur,days:1});
      var nx=new Date(new Date(cur).getTime()+86400000);cur=dstr(nx.getFullYear(),nx.getMonth()+1,nx.getDate());
    }
    return out;
  }
  if(days<=126)return window.mdAnWeeks({from:from,to:to}).map(function(w,i){return {key:w.key,label:w.label,short:'W'+(i+1),from:w.from,to:w.to,days:w.days};});
  var out2=[],c=from.slice(0,7);
  while(c<=to.slice(0,7)){
    var dim=monthDays(c),mf=c+'-01',mt=c+'-'+pad2(dim);
    var bf=from>mf?from:mf,bt=to<mt?to:mt;
    out2.push({key:c,label:MON[+c.slice(5,7)-1]+'-'+c.slice(2,4),short:MON[+c.slice(5,7)-1],from:bf,to:bt,
      days:Math.round((new Date(bt)-new Date(bf))/86400000)+1});
    var y=+c.slice(0,4),m=+c.slice(5,7)+1;if(m>12){m=1;y++;}c=y+'-'+pad2(m);
  }
  return out2;
};
/* Two-series grouped columns — the only multi-series chart in this dashboard, and it stays inside
   the 1–3 series band where colour alone is comfortable. Legend always present, adjacent bars
   separated by a 2px surface gap, caps labelled only while the series is short enough to read. */
window.mdAnGrouped=function(buckets,series,h){
  var n=buckets.length;if(!n)return '';
  h=h||150;
  // Rendered at its natural pixel size inside a horizontally scrolling wrapper. An earlier version
  // used width:100% + preserveAspectRatio="none", which stretched the SVG — and every label in it.
  var w=Math.max(300,n*(n<=8?70:n<=14?54:40));
  var max=0;buckets.forEach(function(b){b.vals.forEach(function(v){max=Math.max(max,v||0);});});
  if(max<=0)max=1;
  var padB=20,padT=16,plotH=h-padB-padT;
  var band=w/n, bw=Math.min(24,(band-10)/series.length-2);
  var legend='<div class="an-mini-legend" style="margin:0 0 6px">'+series.map(function(sv){
    return '<span><i style="background:'+sv.color+'"></i>'+esc(sv.label)+'</span>';}).join('')+'</div>';
  var svg='<svg viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" role="img" style="display:block;max-width:none">'+
    '<line x1="0" y1="'+(h-padB)+'" x2="'+w+'" y2="'+(h-padB)+'" stroke="'+GRID+'" stroke-width="1"></line>';
  buckets.forEach(function(b,i){
    series.forEach(function(sv,si){
      var v=b.vals[si]||0, bh=v?Math.max(1,v/max*plotH):0;
      var x=i*band+(band-(bw+2)*series.length)/2+si*(bw+2), y=h-padB-bh;
      if(bh)svg+='<g><rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bh+'" rx="4" fill="'+sv.color+'"></rect>'+
        '<title>'+esc(b.label+' · '+sv.label+': '+v)+'</title></g>';
      if(n<=8&&v)svg+='<text x="'+(x+bw/2)+'" y="'+(y-4)+'" text-anchor="middle" font-size="10" font-weight="700" fill="#1b2230">'+v+'</text>';
    });
    svg+='<text x="'+(i*band+band/2)+'" y="'+(h-6)+'" text-anchor="middle" font-size="9.5" fill="#67748a">'+esc(b.short)+'</text>';
  });
  return legend+'<div style="overflow-x:auto">'+svg+'</svg></div>';
};
/* TAT distribution — an ordered scale, so it uses ordered steps of the one ramp, not categories. */
window.MD_AN_TAT_BANDS=[{l:'Same / next day',max:1},{l:'2–3 days',max:3},{l:'4–7 days',max:7},{l:'8–14 days',max:14},{l:'15+ days',max:Infinity}];
window.mdAnTatStats=function(tats){
  var v=tats.filter(function(x){return x!=null&&isFinite(x)&&x>=0;}).sort(function(a,b){return a-b;});
  if(!v.length)return null;
  var bands=window.MD_AN_TAT_BANDS.map(function(b){return {label:b.l,v:0};});
  v.forEach(function(x){for(var i=0;i<window.MD_AN_TAT_BANDS.length;i++)if(x<=window.MD_AN_TAT_BANDS[i].max){bands[i].v++;break;}});
  return {n:v.length,min:v[0],max:v[v.length-1],p50:v[Math.floor(v.length*0.5)],p90:v[Math.floor(v.length*0.9)],
    mean:Math.round(v.reduce(function(a,b){return a+b;},0)/v.length*10)/10,
    sameDay:v.filter(function(x){return x===0;}).length,bands:bands};
};
window.mdAnTatHtml=function(st,label){
  if(!st)return '<div class="an-na-note">No completed '+esc(label)+' with a booking date in this range.</div>';
  var h='<div class="an-deliv-row" style="border-bottom:0">'+
    [['Median',st.p50+'d'],['Mean',st.mean+'d'],['90th percentile',st.p90+'d'],['Fastest',st.min+'d'],['Slowest',st.max+'d'],['Executions measured',st.n]]
      .map(function(x){return '<div class="an-deliv-stat"><div class="an-deliv-val" style="color:var(--navy)">'+x[1]+'</div><div class="an-deliv-lbl">'+x[0]+'</div></div>';}).join('')+
    '</div><div style="padding:0 20px 14px">'+
    window.mdAnStackBar(st.bands.map(function(b,i){return {label:b.label,v:b.v,color:RAMP[i],ink:i>=3?'#fff':'#1b2230'};}),st.n,22)+
    '<div class="an-mini-legend" style="margin-top:6px">'+st.bands.map(function(b,i){
      return '<span><i style="background:'+RAMP[i]+'"></i>'+esc(b.label)+' — '+b.v+' ('+Math.round(b.v/st.n*100)+'%)</span>';}).join('')+'</div></div>';
  return h;
};

})();
