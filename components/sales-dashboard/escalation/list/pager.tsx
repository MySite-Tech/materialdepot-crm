'use client';

import { PAGE_SIZE } from '../constants';

export function EscalationPager({ currentPage, goToPage, pageLoading, totalElements, totalPages }: {
  currentPage: number;
  goToPage: (p: number) => void;
  pageLoading: boolean;
  totalElements: number;
  totalPages: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mt-3 px-1">
      <span className="text-xs text-gray-500">
        {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, totalElements)} of {totalElements}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={pageLoading || currentPage === 0}
          className="px-2.5 py-1 text-xs border border-gray-200 rounded bg-white disabled:opacity-40 active:bg-gray-50"
        >
          Prev
        </button>
        <span className="text-xs text-gray-600 px-2">
          Page {currentPage + 1} of {totalPages}
        </span>
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={pageLoading || currentPage >= totalPages - 1}
          className="px-2.5 py-1 text-xs border border-gray-200 rounded bg-white disabled:opacity-40 active:bg-gray-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
