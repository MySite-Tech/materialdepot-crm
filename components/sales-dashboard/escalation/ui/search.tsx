'use client';

import { Dispatch, FormEvent, SetStateAction } from 'react';

export function EscalationSearch({ handleClear, handleSearch, inputValue, setInputValue }: {
  handleClear: () => void;
  handleSearch: (e: FormEvent<Element>) => void;
  inputValue: string;
  setInputValue: Dispatch<SetStateAction<string>>;
}) {
  return (
    <form onSubmit={handleSearch} className="mb-3">
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search ENQ, ticket, owner\u2026"
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-9 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
        />
        {inputValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </form>
  );
}
