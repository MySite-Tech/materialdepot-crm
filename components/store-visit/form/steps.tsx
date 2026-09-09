'use client';

import { FormData } from './types';

import { BranchOption } from './types';
import { BMOption, CurrentSalesBM, UserInfoProperty } from '@/lib/api';
import { useState } from 'react';

export function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
        <div
          key={step}
          className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
            step === currentStep ? 'bg-amber-500 w-6' : step < currentStep ? 'bg-amber-500' : 'bg-gray-300'
          }`}
        />
      ))}
    </div>
  );
}

export function BranchSelector({ branches, isLoading, onSelect }: {
  branches: BranchOption[];
  isLoading: boolean;
  onSelect: (name: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3">
        <div className="w-8 h-8 border-4 border-gray-300 border-t-amber-500 rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Loading branches...</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <label className="text-base font-medium text-gray-900">
        Select your branch <span className="text-red-500">*</span>
      </label>
      <div className="grid gap-3">
        {branches
          .filter((branch) => branch.displayName.trim().toUpperCase() !== 'HYDERABAD')
          .map((branch) => (
          <button
            key={branch.id}
            className="w-full h-12 justify-start text-base font-medium border border-gray-300 rounded-md hover:bg-gray-50 hover:text-gray-900 flex items-center px-3 py-2"
            onClick={() => onSelect(branch.displayName)}
          >
            <span className="mr-3 text-gray-400">📍</span>
            {branch.displayName}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PhoneStep({ phoneNumber, onPhoneChange, onSubmit, isLoading }: {
  phoneNumber: string;
  onPhoneChange: (v: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}) {
  const [error, setError] = useState('');

  const validatePhone = (phone: string) => {
    if (phone.replace(/\D/g, '').length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return false;
    }
    setError('');
    return true;
  };

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (validatePhone(phoneNumber)) onSubmit();
  };

  const handlePhoneChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 10);
    onPhoneChange(cleaned);
    if (error) setError('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="text-base font-medium text-gray-900">
          Phone Number <span className="text-red-500">*</span>
        </label>
        <div className="flex">
          <div className="flex items-center px-3 bg-gray-100 border border-r-0 border-gray-300 rounded-l-md">
            <span className="text-gray-500 text-sm">+91</span>
          </div>
          <input
            type="tel"
            placeholder="Enter your phone number"
            value={phoneNumber}
            onChange={(e) => handlePhoneChange(e.target.value)}
            className="rounded-l-none text-base border border-gray-300 rounded-r-md px-3 py-2 flex-1"
            disabled={isLoading}
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
      <button
        type="submit"
        className="w-full bg-gray-800 hover:bg-gray-700 text-white h-12 text-base font-medium rounded-md"
        disabled={isLoading || !phoneNumber}
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2" />
            Looking up...
          </>
        ) : (
          <>Continue <span className="ml-2">→</span></>
        )}
      </button>
    </form>
  );
}

export function UserProfileStep({ formData, onNameChange, onLocalityChange, onUserTypeChange, onCategoryToggle, onSubmit, isLoading, userTypeProp, categoriesProp }: {
  formData: FormData;
  onNameChange: (v: string) => void;
  onLocalityChange: (v: string) => void;
  onUserTypeChange: (v: string) => void;
  onCategoryToggle: (v: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  userTypeProp: UserInfoProperty | null;
  categoriesProp: UserInfoProperty | null;
}) {
  const isValid = formData.name.trim() && formData.userType && formData.categories.length > 0;

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (isValid) onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3">
        <label className="text-base font-medium text-gray-900">
          Your Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          placeholder="Enter your name"
          value={formData.name}
          onChange={(e) => onNameChange(e.target.value)}
          className="h-12 w-full border border-gray-300 rounded-md px-3 py-2"
        />
      </div>
      <div className="space-y-3">
        <label className="text-base font-medium text-gray-900">
          Locality <span className="text-gray-400 text-sm font-normal">(optional)</span>
        </label>
        <input
          type="text"
          placeholder="Society name / Area / Pincode"
          value={formData.locality}
          onChange={(e) => onLocalityChange(e.target.value)}
          className="h-12 w-full border border-gray-300 rounded-md px-3 py-2"
        />
      </div>
      {categoriesProp && (
        <div className="space-y-3">
          <label className="text-base font-medium text-gray-900">
            {categoriesProp.name} <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(categoriesProp.options || []).map((option) => (
              <label key={option} className="flex items-center space-x-2 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.categories.includes(option)}
                  onChange={() => onCategoryToggle(option)}
                  className="text-amber-500"
                />
                <span className="text-sm">{option}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      {userTypeProp && (
        <div className="space-y-3">
          <label className="text-base font-medium text-gray-900">
            {userTypeProp.name} <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(userTypeProp.options || []).map((option) => (
              <label key={option} className="flex items-center space-x-2 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name="userType"
                  value={option}
                  checked={formData.userType === option}
                  onChange={() => onUserTypeChange(option)}
                  className="text-amber-500"
                />
                <span className="text-sm">{option}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <button
        type="submit"
        className="w-full bg-gray-800 hover:bg-gray-700 text-white h-12 text-base font-medium rounded-md"
        disabled={isLoading || !isValid}
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2" />
            Saving...
          </>
        ) : (
          <>Continue <span className="ml-2">→</span></>
        )}
      </button>
    </form>
  );
}

export function BMAssignmentStep({ bms, selectedBM, onSelect, onSubmit, isLoading, isFetchingBMs, currentSalesBM }: {
  bms: BMOption[];
  selectedBM: string | null;
  onSelect: (contact: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  isFetchingBMs: boolean;
  currentSalesBM?: CurrentSalesBM;
}) {
  const [search, setSearch] = useState('');

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (selectedBM) onSubmit();
  };

  if (isFetchingBMs) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3">
        <div className="w-8 h-8 border-4 border-gray-300 border-t-amber-500 rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Loading Business Managers...</p>
      </div>
    );
  }

  if (bms.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">No Business Managers available for this branch.</p>
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const filteredBMs = query
    ? bms.filter((bm) => {
        const displayName = `${bm.f_name} ${bm.l_name}`.trim().toLowerCase();
        return displayName.includes(query) || String(bm.bm_contact).toLowerCase().includes(query);
      })
    : bms;

  const currentBMDisplayName = currentSalesBM
    ? `${currentSalesBM.f_name} ${currentSalesBM.l_name}`.trim() || currentSalesBM.bm_contact
    : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3">
        <label className="text-base font-medium text-gray-900">
          Assign Sales BM <span className="text-red-500">*</span>
        </label>

        {currentSalesBM && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">Current Sales BM</p>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-semibold text-sm">
                {currentSalesBM.f_name?.[0] || '?'}
              </div>
              <div>
                <p className="font-medium text-gray-900">{currentBMDisplayName}</p>
                <p className="text-sm text-gray-500">{currentSalesBM.bm_contact}</p>
              </div>
            </div>
          </div>
        )}

        <input
          type="text"
          placeholder="Search by name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 w-full border border-gray-300 rounded-md px-3 py-2 text-base"
        />
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filteredBMs.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">No Business Managers match &quot;{search}&quot;.</p>
          ) : (
            filteredBMs.map((bm) => {
              const displayName = `${bm.f_name} ${bm.l_name}`.trim() || bm.bm_contact;
              const isCurrentBM = currentSalesBM?.bm_contact === bm.bm_contact;
              return (
                <label
                  key={bm.user_id}
                  className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    isCurrentBM
                      ? 'border-amber-500 bg-amber-50 hover:bg-amber-100'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="bm"
                    value={bm.bm_contact}
                    checked={selectedBM === bm.bm_contact}
                    onChange={() => onSelect(bm.bm_contact)}
                    className="text-amber-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{displayName}</p>
                      {isCurrentBM && (
                        <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{bm.bm_contact}</p>
                  </div>
                </label>
              );
            })
          )}
        </div>
      </div>
      <button
        type="submit"
        className="w-full bg-gray-800 hover:bg-gray-700 text-white h-12 text-base font-medium rounded-md"
        disabled={isLoading || !selectedBM}
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2" />
            Assigning...
          </>
        ) : (
          <>Assign & Finish <span className="ml-2">→</span></>
        )}
      </button>
    </form>
  );
}
