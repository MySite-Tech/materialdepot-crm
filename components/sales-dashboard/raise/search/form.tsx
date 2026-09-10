'use client';

import { Dispatch, FormEvent, SetStateAction } from 'react';

export function SearchForm({ handleOpenKylasModal, handleSearch, inputValue, loading, setInputValue }: {
  handleOpenKylasModal: () => void;
  handleSearch: (e: FormEvent<Element>) => Promise<void>;
  inputValue: string;
  loading: boolean;
  setInputValue: Dispatch<SetStateAction<string>>;
}) {
  return (
    <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 mb-4">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Search by contact or deal…"
        className="w-full sm:flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg bg-[#EAB308] text-gray-950 text-sm font-semibold disabled:opacity-50"
        >
          Search
        </button>
        <button
          type="button"
          onClick={handleOpenKylasModal}
          className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg bg-gray-900 text-yellow-400 text-sm font-semibold whitespace-nowrap"
        >
          Create Kylas Deal
        </button>
      </div>
    </form>
  );
}
