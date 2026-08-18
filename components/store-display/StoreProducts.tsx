'use client';
import { useState, useEffect, useCallback } from 'react';
import { displayApi, flattenLocationRow } from '../../lib/displayApi';
import { STORES, STORE_CODE_TO_BRANCH_ID, STORE_NAMES, BRANCH_ID_TO_STORE } from '../../lib/displaySupabase';
import { ProductDetailPanel } from './ProductDetailPanel';

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

export function StoreProducts() {
  const [selectedStore, setSelectedStore] = useState('All');
  const [items, setItems] = useState<VariantLocationRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [categories, setCategories] = useState<string[]>(['All']);
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<VariantLocationRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    (async () => {
      try {
        const params: Record<string, any> = { is_active: true, page_size: 1000 };
        if (selectedStore !== 'All') {
          params.branch_id = STORE_CODE_TO_BRANCH_ID[selectedStore] || selectedStore;
        }
        const data = await displayApi('fetch_locations', params);
        const raw = data?.data ?? data?.results ?? (Array.isArray(data) ? data : []);
        const rows = raw.map(flattenLocationRow);
        const unique = Array.from(new Set(rows.map((r: any) => r.category).filter(Boolean))).sort() as string[];
        setCategories(['All', ...unique]);
      } catch {}
    })();
  }, [selectedStore]);

  const fetchPage = useCallback(async (storeCode: string, pageNum: number, category: string, searchQ: string) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {
        is_active: true,
        page: pageNum,
        page_size: PAGE_SIZE,
      };
      if (storeCode !== 'All') {
        params.branch_id = STORE_CODE_TO_BRANCH_ID[storeCode] || storeCode;
      }
      if (category !== 'All') params.category = category;
      if (searchQ.trim()) params.search = searchQ.trim();

      const data = await displayApi('fetch_locations', params);
      const raw = data?.data ?? data?.results ?? (Array.isArray(data) ? data : []);
      const rows = raw.map(flattenLocationRow);
      const count = data?.total_count ?? data?.count ?? rows.length;
      setItems(rows as VariantLocationRow[]);
      setTotalCount(count);
    } catch (e: any) {
      setError(e.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(selectedStore, page, selectedCategory, debouncedSearch);
  }, [selectedStore, page, selectedCategory, debouncedSearch, fetchPage]);

  useEffect(() => { setPage(1); }, [debouncedSearch, selectedCategory, selectedStore]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const storeName = selectedStore === 'All' ? 'All Stores' : (STORE_NAMES[selectedStore] || selectedStore);

  if (selectedItem) {
    return (
      <ProductDetailPanel
        item={selectedItem}
        storeName={storeName}
        onBack={() => setSelectedItem(null)}
      />
    );
  }

  return (
    <div className="px-6 py-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Store</label>
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none bg-white"
          >
            <option value="All">All Stores</option>
            {STORES.map(s => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Category</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none bg-white min-w-[160px]"
          >
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Search</label>
          <input
            type="text"
            placeholder="Search by name, SKU, handle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none bg-white w-full"
          />
        </div>
        <div className="self-end">
          <span className="text-[12px] text-gray-400">
            {loading ? 'Loading...' : `${totalCount} products`}
          </span>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-gray-400">Loading products...</div>
      ) : error ? (
        <div className="py-16 text-center text-red-500">{error}</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-gray-400">No products found</div>
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
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr
                      key={`${item.id}-${idx}`}
                      onClick={() => setSelectedItem(item)}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
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
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700">
                          {item.display_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-600">{item.location_string}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{item.quantity}</td>
                      <td className="px-3 py-2">
                        {item.is_deleted ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-600">Discontinued</span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-green-50 text-green-700">Active</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 text-[12px] border border-gray-200 rounded bg-white disabled:opacity-40 cursor-pointer disabled:cursor-default"
              >
                Prev
              </button>
              <span className="text-[12px] text-gray-500">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 text-[12px] border border-gray-200 rounded bg-white disabled:opacity-40 cursor-pointer disabled:cursor-default"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
