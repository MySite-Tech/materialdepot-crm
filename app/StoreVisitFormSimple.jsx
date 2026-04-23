'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

// Mock API functions - simplified versions
const mockApi = {
  fetchBranches: async () => {
    // Mock branches data
    return [
      { id: 1, name: 'JP Nagar', displayName: 'JP Nagar' },
      { id: 2, name: 'Whitefield', displayName: 'Whitefield' },
      { id: 3, name: 'Yelankha', displayName: 'Yelankha' },
      { id: 4, name: 'HQ', displayName: 'HQ' },
    ];
  },
  
  lookupLeadByPhone: async (phone, branch) => {
    // Mock API call - in real implementation this would call your actual API
    console.log(`Looking up lead for phone: ${phone}, branch: ${branch}`);
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock response
    return {
      success: true,
      leadId: 12345,
      leadData: {
        id: 12345,
        customFieldValues: {
          cfUserType: null,
          cfCategoriesOfInterest: [],
        },
        conversionDetails: [],
      },
      fullLeadBody: {
        firstName: 'John',
        lastName: 'Doe',
      },
    };
  },
  
  updateLead: async (leadId, data, customFields, phone, name) => {
    console.log(`Updating lead ${leadId} with data:`, { data, customFields, phone, name });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      success: true,
      leadId: leadId,
      conversionDetails: [{ entityType: 'CONTACT', entityId: 67890 }],
    };
  }
};

// Simple toast implementation
function useToast() {
  const toast = ({ title, description, variant = 'default' }) => {
    // Create a simple toast notification
    const toastElement = document.createElement('div');
    toastElement.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm ${
      variant === 'destructive' ? 'bg-red-500 text-white' : 'bg-gray-800 text-white'
    }`;
    toastElement.innerHTML = `
      ${title ? `<div class="font-semibold">${title}</div>` : ''}
      ${description ? `<div class="text-sm mt-1">${description}</div>` : ''}
    `;
    
    document.body.appendChild(toastElement);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
      if (toastElement.parentNode) {
        toastElement.parentNode.removeChild(toastElement);
      }
    }, 3000);
  };
  
  return { toast };
}

// Constants
const USER_TYPE_OPTIONS = {
  architect: { id: 2686527, label: "Architect" },
  homeOwner: { id: 2686528, label: "Home owner" },
};

const CATEGORY_OPTIONS = {
  tiles: { id: 2689623, label: "Tiles" },
  panels: { id: 2689624, label: "Panels" },
  laminates: { id: 2689625, label: "Laminates" },
  wallpapers: { id: 2689626, label: "Wallpapers" },
  woodenFlooring: { id: 2689627, label: "Wooden Flooring" },
  others: { id: 2689628, label: "Others" },
};

// Components
function HeroBanner() {
  return (
    <div className="relative w-full h-48 md:h-64 bg-black overflow-hidden">
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-4 text-center">
        <div className="w-16 h-16 md:w-20 md:h-20 bg-amber-500 rounded-full flex items-center justify-center mb-4 shadow-lg border-4 border-white">
          <span className="text-white text-3xl md:text-4xl font-bold">M</span>
        </div>
        <h1 className="text-white text-xl md:text-2xl font-bold tracking-tight">
          India's Biggest Interior Megastore
        </h1>
        <p className="text-white/80 text-sm md:text-base mt-1">
          Material Depot
        </p>
      </div>
    </div>
  );
}

function StepIndicator({ currentStep, totalSteps }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
        <div
          key={step}
          className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
            step === currentStep
              ? "bg-amber-500 w-6"
              : step < currentStep
              ? "bg-amber-500"
              : "bg-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

function BranchSelector({ branches, isLoading, onSelect }) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3">
        <div className="w-8 h-8 border-4 border-gray-300 border-t-amber-500 rounded-full animate-spin"></div>
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

function PhoneStep({ phoneNumber, onPhoneChange, onSubmit, isLoading }) {
  const [error, setError] = useState("");

  const validatePhone = (phone) => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length !== 10) {
      setError("Please enter a valid 10-digit phone number");
      return false;
    }
    setError("");
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validatePhone(phoneNumber)) {
      onSubmit();
    }
  };

  const handlePhoneChange = (value) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 10);
    onPhoneChange(cleaned);
    if (error) setError("");
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
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2"></div>
            Looking up...
          </>
        ) : (
          <>
            Continue
            <span className="ml-2">→</span>
          </>
        )}
      </button>
    </form>
  );
}

function UserProfileStep({ formData, onNameChange, onUserTypeChange, onCategoryToggle, onSubmit, isLoading }) {
  const userTypeEntries = Object.entries(USER_TYPE_OPTIONS);
  const categoryEntries = Object.entries(CATEGORY_OPTIONS);

  const isValid = formData.name.trim() && formData.userType && formData.categories.length > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isValid) {
      onSubmit();
    }
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
          {userTypeEntries.map(([key, option]) => (
            <label
              key={key}
              className="flex items-center space-x-3 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
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
          {categoryEntries.map(([key, option]) => (
            <label
              key={key}
              className="flex items-center space-x-2 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
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
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2"></div>
            Saving...
          </>
        ) : (
          <>
            Continue
            <span className="ml-2">→</span>
          </>
        )}
      </button>
    </form>
  );
}

// Main component
export default function StoreVisitFormSimple() {
  const searchParams = useSearchParams();
  const branch = searchParams.get("branch") || "";
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = useState(branch ? 1 : 0);
  const [formData, setFormData] = useState({
    phoneNumber: "",
    name: "",
    userType: null,
    categories: [],
    projectType: null,
    propertyType: null,
    propertyName: "",
  });
  const [leadId, setLeadId] = useState(null);
  const [leadData, setLeadData] = useState(null);
  const [fullLeadBody, setFullLeadBody] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  const totalSteps = 2;

  // Always fetch branches
  useEffect(() => {
    setBranchesLoading(true);
    mockApi.fetchBranches()
      .then(setBranches)
      .catch(() => {
        if (!branch) {
          toast({ title: "Error", description: "Failed to load branches.", variant: "destructive" });
        }
      })
      .finally(() => setBranchesLoading(false));
  }, [branch, toast]);

  // Prefill name from lead data if available
  useEffect(() => {
    if (fullLeadBody) {
      const firstName = fullLeadBody.firstName;
      const lastName = fullLeadBody.lastName;
      const prefillName = firstName?.trim() || lastName?.trim() || "";
      if (prefillName) {
        setFormData((prev) => ({ ...prev, name: prefillName }));
      }
    }
  }, [leadData, fullLeadBody]);

  const handleBranchSelect = (branchName) => {
    const url = new URL(window.location);
    url.searchParams.set("branch", branchName);
    window.history.pushState({}, "", url);
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

      // Check if both user type AND categories exist
      if (cfUserType && cfCategoriesOfInterest && cfCategoriesOfInterest.length > 0) {
        toast({
          title: "Welcome back!",
          description: "Redirecting to your profile...",
        });
        // In real implementation, redirect to Kylas
        setTimeout(() => {
          window.open("https://app.kylas.io", "_blank");
        }, 1000);
      } else {
        // Missing data - go to step 2
        setCurrentStep(2);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to lookup your information. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserProfileSubmit = async () => {
    await handleFinalSubmit();
  };

  const handleFinalSubmit = async () => {
    if (!leadId || !leadData) return;

    setIsLoading(true);
    try {
      // Build custom field values with option IDs
      const customFieldValues = {
        cfCategoriesOfInterest: formData.categories.map((cat) => CATEGORY_OPTIONS[cat].id),
      };

      const updateResponse = await mockApi.updateLead(leadId, fullLeadBody, customFieldValues, formData.phoneNumber, formData.name);

      toast({
        title: "Thank you!",
        description: "Your information has been saved. Redirecting...",
      });

      // In real implementation, redirect to Kylas
      setTimeout(() => {
        window.open("https://app.kylas.io", "_blank");
      }, 2000);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save your information. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategoryToggle = (category) => {
    setFormData((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <HeroBanner />

      <div className="max-w-md mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">Welcome!</h2>
          <p className="text-gray-600 mt-1">We would love to know more about you!</p>
        </div>

        {branch && <StepIndicator currentStep={currentStep} totalSteps={totalSteps} />}

        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          {!branch && (
            <BranchSelector
              branches={branches}
              isLoading={branchesLoading}
              onSelect={handleBranchSelect}
            />
          )}

          {branch && currentStep === 1 && (
            <PhoneStep
              phoneNumber={formData.phoneNumber}
              onPhoneChange={(phone) => setFormData((prev) => ({ ...prev, phoneNumber: phone }))}
              onSubmit={handlePhoneSubmit}
              isLoading={isLoading}
            />
          )}

          {branch && currentStep === 2 && (
            <UserProfileStep
              formData={formData}
              onNameChange={(name) => setFormData((prev) => ({ ...prev, name }))}
              onUserTypeChange={(userType) => setFormData((prev) => ({ ...prev, userType }))}
              onCategoryToggle={handleCategoryToggle}
              onSubmit={handleUserProfileSubmit}
              isLoading={isLoading}
            />
          )}
        </div>

        {branch && (
          <p className="text-center text-xs text-gray-500 mt-4">
            Branch: {branch}
          </p>
        )}
      </div>
    </div>
  );
}
