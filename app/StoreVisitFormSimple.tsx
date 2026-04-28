'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from './StoreVisitWrapper';
import { fetchBMsByBranch, assignBMToClient, lookupLeadByPhone, updateLead, type BMOption } from '../lib/mockApi';
import type { LeadData } from '../types/storeVisit';

interface BranchOption {
  id: number;
  name: string;
  displayName: string;
}

interface FullLeadBody {
  firstName?: string;
  lastName?: string;
}

const mockApi = {
  fetchBranches: async (): Promise<BranchOption[]> => {
    return [
      { id: 1, name: 'JP Nagar', displayName: 'JP Nagar' },
      { id: 2, name: 'Whitefield', displayName: 'Whitefield' },
      { id: 3, name: 'Yelankha', displayName: 'Yelankha' },
      { id: 4, name: 'HQ', displayName: 'HQ' },
    ];
  },

  lookupLeadByPhone: (phone: string, branch: string) => lookupLeadByPhone(phone, branch),

  updateLead: (leadId: number, data: FullLeadBody, customFields: Record<string, unknown>, phone: string, name: string) =>
    updateLead(leadId, data as Record<string, unknown>, customFields, phone, name),

  fetchBMsByBranch: (branch: string) => fetchBMsByBranch(branch),

  assignBM: (clientContact: string, bmContact: string, kylasLeadId: number | null) =>
    assignBMToClient(clientContact, bmContact, kylasLeadId ?? undefined),
};

const USER_TYPE_OPTIONS = {
  architect: { id: 2686527, label: 'Architect' },
  homeOwner: { id: 2686528, label: 'Home owner' },
} as const;

const CATEGORY_OPTIONS = {
  tiles: { id: 2689623, label: 'Tiles' },
  panels: { id: 2689624, label: 'Panels' },
  laminates: { id: 2689625, label: 'Laminates' },
  wallpapers: { id: 2689626, label: 'Wallpapers' },
  woodenFlooring: { id: 2689627, label: 'Wooden Flooring' },
  others: { id: 2689628, label: 'Others' },
} as const;

type UserTypeKey = keyof typeof USER_TYPE_OPTIONS;
type CategoryKey = keyof typeof CATEGORY_OPTIONS;

interface FormData {
  phoneNumber: string;
  name: string;
  userType: UserTypeKey | null;
  categories: CategoryKey[];
  projectType: null;
  propertyType: null;
  propertyName: string;
}


function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
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

function BranchSelector({ branches, isLoading, onSelect }: {
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
        {branches.map((branch) => (
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

function PhoneStep({ phoneNumber, onPhoneChange, onSubmit, isLoading }: {
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

  const handleSubmit = (e: React.FormEvent) => {
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

function UserProfileStep({ formData, onNameChange, onUserTypeChange, onCategoryToggle, onSubmit, isLoading }: {
  formData: FormData;
  onNameChange: (v: string) => void;
  onUserTypeChange: (v: UserTypeKey) => void;
  onCategoryToggle: (v: CategoryKey) => void;
  onSubmit: () => void;
  isLoading: boolean;
}) {
  const isValid = formData.name.trim() && formData.userType && formData.categories.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
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
          What would best describe you? <span className="text-red-500">*</span>
        </label>
        <div className="space-y-2">
          {(Object.entries(USER_TYPE_OPTIONS) as [UserTypeKey, { id: number; label: string }][]).map(([key, option]) => (
            <label key={key} className="flex items-center space-x-3 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="radio"
                name="userType"
                value={key}
                checked={formData.userType === key}
                onChange={() => onUserTypeChange(key)}
                className="text-amber-500"
              />
              <span className="flex-1">{option.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <label className="text-base font-medium text-gray-900">
          Interested categories? <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(CATEGORY_OPTIONS) as [CategoryKey, { id: number; label: string }][]).map(([key, option]) => (
            <label key={key} className="flex items-center space-x-2 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.categories.includes(key)}
                onChange={() => onCategoryToggle(key)}
                className="text-amber-500"
              />
              <span className="text-sm">{option.label}</span>
            </label>
          ))}
        </div>
      </div>
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

function BMAssignmentStep({ bms, selectedBM, onSelect, onSubmit, isLoading, isFetchingBMs }: {
  bms: BMOption[];
  selectedBM: string | null;
  onSelect: (contact: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  isFetchingBMs: boolean;
}) {
  const [search, setSearch] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3">
        <label className="text-base font-medium text-gray-900">
          Assign Business Manager <span className="text-red-500">*</span>
        </label>
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
              return (
                <label
                  key={bm.user_id}
                  className="flex items-center space-x-3 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
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
                    <p className="font-medium text-gray-900">{displayName}</p>
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

export default function StoreVisitFormSimple() {
  const searchParams = useSearchParams();
  const branch = searchParams.get('branch') || '';
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = useState(branch ? 1 : 0);
  const [formData, setFormData] = useState<FormData>({
    phoneNumber: '',
    name: '',
    userType: null,
    categories: [],
    projectType: null,
    propertyType: null,
    propertyName: '',
  });
  const [leadId, setLeadId] = useState<number | null>(null);
  const [leadData, setLeadData] = useState<LeadData | null>(null);
  const [fullLeadBody, setFullLeadBody] = useState<FullLeadBody | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [bms, setBMs] = useState<BMOption[]>([]);
  const [bmsLoading, setBMsLoading] = useState(false);
  const [selectedBM, setSelectedBM] = useState<string | null>(null);

  const totalSteps = 3;

  useEffect(() => {
    setBranchesLoading(true);
    mockApi.fetchBranches()
      .then(setBranches)
      .catch(() => {
        if (!branch) {
          toast({ title: 'Error', description: 'Failed to load branches.', variant: 'destructive' });
        }
      })
      .finally(() => setBranchesLoading(false));
  }, [branch, toast]);

  useEffect(() => {
    if (fullLeadBody) {
      const prefillName = fullLeadBody.firstName?.trim() || fullLeadBody.lastName?.trim() || '';
      if (prefillName) {
        setFormData(prev => ({ ...prev, name: prefillName }));
      }
    }
  }, [leadData, fullLeadBody]);

  const handleBranchSelect = (branchName: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('branch', branchName);
    window.history.pushState({}, '', url);
    setCurrentStep(1);
  };

  const handlePhoneSubmit = async () => {
    setIsLoading(true);
    try {
      const response = await mockApi.lookupLeadByPhone(formData.phoneNumber, branch);
      setLeadId(response.leadId);
      setLeadData(response.leadData);
      setFullLeadBody(response.fullLeadBody || null);

      const { cfUserType, cfCategoriesOfInterest } = response.leadData.customFieldValues;
      if (cfUserType && cfCategoriesOfInterest && cfCategoriesOfInterest.length > 0) {
        toast({ title: 'Welcome back!', description: 'Redirecting to your profile...' });
        setTimeout(() => { window.open(`https://app.kylas.io/sales/leads/details/${response.leadId}`, '_blank'); }, 1000);
      } else {
        setCurrentStep(2);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to lookup your information. Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalSubmit = async () => {
    if (!leadId || !leadData) return;
    setIsLoading(true);
    try {
      const customFieldValues = {
        cfCategoriesOfInterest: formData.categories.map(cat => CATEGORY_OPTIONS[cat].id),
      };
      await mockApi.updateLead(leadId, fullLeadBody || {}, customFieldValues, formData.phoneNumber, formData.name);
      setCurrentStep(3);
      setBMsLoading(true);
      try {
        const bmList = await mockApi.fetchBMsByBranch(branch);
        setBMs(bmList);
      } catch {
        toast({ title: 'Error', description: 'Failed to load Business Managers.', variant: 'destructive' });
      } finally {
        setBMsLoading(false);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to save your information. Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBMAssign = async () => {
    if (!selectedBM || !leadId) return;
    setIsLoading(true);
    try {
      const result = await mockApi.assignBM(formData.phoneNumber, selectedBM, leadId);
      const description = result.created
        ? 'Business Manager assigned successfully. Redirecting...'
        : result.reactivated
          ? 'Previous assignment reactivated. Redirecting...'
          : 'Business Manager already assigned and active. Redirecting...';
      toast({ title: 'Done!', description });
      setTimeout(() => { window.open(`https://app.kylas.io/sales/leads/details/${leadId}`, '_blank'); }, 1500);
    } catch {
      toast({ title: 'Error', description: 'Failed to assign Business Manager. Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategoryToggle = (category: CategoryKey) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category],
    }));
  };

  return (
    <div className="px-3 py-3 sm:px-6 sm:py-4">
      <div className="max-w-md mx-auto">
        <div className="mb-4">
          <h2 className="text-[15px] font-semibold text-gray-900">Store Visit Form</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">We would love to know more about you!</p>
        </div>
        {branch && <StepIndicator currentStep={currentStep} totalSteps={totalSteps} />}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          {!branch && (
            <BranchSelector branches={branches} isLoading={branchesLoading} onSelect={handleBranchSelect} />
          )}
          {branch && currentStep === 1 && (
            <PhoneStep
              phoneNumber={formData.phoneNumber}
              onPhoneChange={phone => setFormData(prev => ({ ...prev, phoneNumber: phone }))}
              onSubmit={handlePhoneSubmit}
              isLoading={isLoading}
            />
          )}
          {branch && currentStep === 2 && (
            <UserProfileStep
              formData={formData}
              onNameChange={name => setFormData(prev => ({ ...prev, name }))}
              onUserTypeChange={userType => setFormData(prev => ({ ...prev, userType }))}
              onCategoryToggle={handleCategoryToggle}
              onSubmit={handleFinalSubmit}
              isLoading={isLoading}
            />
          )}
          {branch && currentStep === 3 && (
            <BMAssignmentStep
              bms={bms}
              selectedBM={selectedBM}
              onSelect={setSelectedBM}
              onSubmit={handleBMAssign}
              isLoading={isLoading}
              isFetchingBMs={bmsLoading}
            />
          )}
        </div>
        {branch && <p className="text-center text-xs text-gray-500 mt-4">Branch: {branch}</p>}
      </div>
    </div>
  );
}

