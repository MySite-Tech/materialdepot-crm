'use client';
import { useState, useEffect, useCallback } from 'react';
import { getDisplaySupabase, STORES, STORE_CODE_TO_BRANCH_ID, STORE_NAMES, BRANCH_ID_TO_STORE } from '../../lib/displaySupabase';

interface VariantLocationRow {
  id: number;
  branch_id: string;
  branch_name: string;
  variant_handle: string;
  product_name: string;
  sku: string | null;
  category: string;
  display_type: string;
  location_string: string;
  is_active: boolean;
  is_deleted: boolean;
  image_url: string | null;
  quantity: number;
  private_label_product_name: string | null;
  private_label_brand: string | null;
}

const PAGE_SIZE = 30;

export function DiscontinuedList() {
  const [selectedStore, setSelectedStore] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedDisplayType, setSelectedDisplayType] = useState('All');
  const [categories, setCategories] = useState<string[]>(['All']);
  const [displayTypes, setDisplayTypes] = useState<string[]>(['All']);
  const [items, setItems] = useState<VariantLocationRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch filter options
  useEffect(() => {
    (async () => {
      try {
        const sb = getDisplaySupabase();
        let q = sb
          .from('variant_locations_cache')
          .select('category, display_type')
          .eq('is_deleted', true);
        if (selectedStore !== 'All') {
          q = q.eq('branch_id', STORE_CODE_TO_BRANCH_ID[selectedStore] || selectedStore);
        }
        const { data } = await q;
        if (data) {
          const cats = Array.from(new Set(data.map((r: any) => r.category).filter(Boolean))).sort() as string[];
          const dts = Array.from(new Set(data.map((r: any) => r.display_type).filter(Boolean))).sort() as string[];
          setCategories(['All', ...cats]);
          setDisplayTypes(['All', ...dts]);
        }
      } catch {}
    })();
  }, [selectedStore]);

  const fetchPage = useCallback(async (storeCode: string, pageNum: number, category: string, displayType: string, searchQ: string) => {
    setLoading(true);
    setError(null);
    try {
      const sb = getDisplaySupabase();
      const from = (pageNum - 1) * PAGE_SIZE;

      let query = sb
        .from('variant_locations_cache')
        .select('*', { count: 'exact' })
        .eq('is_deleted', true)
        .order('product_name', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (storeCode !== 'All') {
        query = query.eq('branch_id', STORE_CODE_TO_BRANCH_ID[storeCode] || storeCode);
      }
      if (category !== 'All') {
        query = query.eq('category', category);
      }
      if (displayType !== 'All') {
        query = query.eq('display_type', displayType);
      }
      if (searchQ.trim()) {
        query = query.or(
          `product_name.ilike.%${searchQ}%,sku.ilike.%${searchQ}%,variant_handle.ilike.%${searchQ}%,location_string.ilike.%${searchQ}%`
        );
      }

      const { data, count, error: fetchError } = await query;
      if (fetchError) throw new Error(fetchError.message);
      setItems((data || []) as VariantLocationRow[]);
      setTotalCount(count ?? 0);
    } catch (e: any) {
      setError(e.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(selectedStore, page, selectedCategory, selectedDisplayType, debouncedSearch);
  }, [selectedStore, page, selectedCategory, selectedDisplayType, debouncedSearch, fetchPage]);

  useEffect(() => { setPage(1); }, [debouncedSearch, selectedCategory, selectedDisplayType, selectedStore]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  return (
    <div className="px-6 py-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Store</label>
          <select value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)} className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none bg-white">
            <option value="All">All Stores</option>
            {STORES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Category</label>
          <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none bg-white min-w-[160px]">
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Display Type</label>
          <select value={selectedDisplayType} onChange={(e) => setSelectedDisplayType(e.target.value)} className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none bg-white min-w-[140px]">
            {displayTypes.map(dt => <option key={dt} value={dt}>{dt === 'All' ? dt : dt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Search</label>
          <input type="text" placeholder="Search by name, SKU, handle..." value={search} onChange={(e) => setSearch(e.target.value)} className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none bg-white w-full" />
        </div>
        <div className="self-end">
          <span className="text-[12px] text-gray-400">{loading ? 'Loading...' : `${totalCount} discontinued`}</span>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-gray-400">Loading discontinued products...</div>
      ) : error ? (
        <div className="py-16 text-center text-red-500">{error}</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-gray-400">No discontinued products found</div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 w-[60px]">Image</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Product</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">SKU</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Store</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Category</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Display</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Location</th>
                    <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Qty</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                    <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={`${item.id}-${idx}`} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <div className="w-10 h-10 rounded bg-gray-100 overflow-hidden flex-shrink-0">
                          {item.image_url ? (
                            <img src={item.image_url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300 text-[10px]">—</div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-800 line-clamp-2 max-w-[250px]">{item.product_name}</div>
                        {item.private_label_product_name && (
                          <div className="text-[11px] text-gray-400 mt-0.5">PL: {item.private_label_product_name}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{item.sku || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 text-[12px]">{item.branch_name || BRANCH_ID_TO_STORE[item.branch_id]?.name || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{item.category}</td>
                      <td className="px-3 py-2">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700">{item.display_type}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-600">{item.location_string}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{item.quantity}</td>
                      <td className="px-3 py-2">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-600">Discontinued</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <a href={`https://materialdepot.com/${item.variant_handle}/product`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 hover:text-blue-800 underline">View →</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="px-3 py-1.5 text-[12px] border border-gray-200 rounded bg-white disabled:opacity-40 cursor-pointer disabled:cursor-default">Prev</button>
              <span className="text-[12px] text-gray-500">Page {currentPage} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="px-3 py-1.5 text-[12px] border border-gray-200 rounded bg-white disabled:opacity-40 cursor-pointer disabled:cursor-default">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
