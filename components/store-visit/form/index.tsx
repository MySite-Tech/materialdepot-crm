'use client';

import { FormData } from './types';

import { useToast } from '../toast';
import { mockApi } from './api';
import { CATEGORIES_PROPERTY_ID, LOCALITY_PROPERTY_ID, USER_TYPE_PROPERTY_ID } from './constants';
import { BMAssignmentStep, BranchSelector, PhoneStep, StepIndicator, UserProfileStep } from './steps';
import { BranchOption } from './types';
import { BMOption, CurrentSalesBM, UserInfoProperty, fetchUserInfoProperties, saveUserProperties, syncLeadToKylas, updateLeadProperties } from '@/lib/api';
import { useEffect, useState } from 'react';

export default function StoreVisitFormSimple() {
  const { toast } = useToast();

  const [branch, setBranch] = useState('');
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('branch')) {
      url.searchParams.delete('branch');
      window.history.replaceState({}, '', url);
    }
  }, []);
  const [formData, setFormData] = useState<FormData>({
    phoneNumber: '',
    name: '',
    userType: null,
    categories: [],
    locality: '',
    projectType: null,
    propertyType: null,
    propertyName: '',
  });
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [bms, setBMs] = useState<BMOption[]>([]);
  const [bmsLoading, setBMsLoading] = useState(false);
  const [selectedBM, setSelectedBM] = useState<string | null>(null);
  const [currentSalesBM, setCurrentSalesBM] = useState<CurrentSalesBM | undefined>(undefined);
  const [footfallCount, setFootfallCount] = useState<number>(0);
  const [userTypeProp, setUserTypeProp] = useState<UserInfoProperty | null>(null);
  const [categoriesProp, setCategoriesProp] = useState<UserInfoProperty | null>(null);

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
    fetchUserInfoProperties([USER_TYPE_PROPERTY_ID, CATEGORIES_PROPERTY_ID])
      .then(props => {
        setUserTypeProp(props.find(p => p.id === USER_TYPE_PROPERTY_ID) || null);
        setCategoriesProp(props.find(p => p.id === CATEGORIES_PROPERTY_ID) || null);
      })
      .catch(() => {});
  }, []);

  const handleBranchSelect = (branchName: string) => {
    setBranch(branchName);
    setCurrentStep(1);
  };

  const loadBMs = async () => {
    setBMsLoading(true);
    try {
      const bmList = await mockApi.fetchBMsByBranch(branch);
      setBMs(bmList);
    } catch {
      toast({ title: 'Error', description: 'Failed to load Business Managers.', variant: 'destructive' });
    } finally {
      setBMsLoading(false);
    }
  };

  const handlePhoneSubmit = async () => {
    setIsLoading(true);
    try {
      const response = await mockApi.lookupLeadByPhone(formData.phoneNumber, branch);
      setUserId(response.userId || null);

      const updates: Partial<FormData> = {};

      if (response.name) {
        updates.name = response.name;
      }

      if (response.userProperties) {
        const props = response.userProperties;

        if (props[48]) {
          updates.categories = props[48].split(',').map(c => c.trim()).filter(Boolean);
        }

        if (props[81]) {
          updates.userType = props[81];
        }

        if (props[2]) {
          updates.locality = props[2];
        }
      }

      if (Object.keys(updates).length > 0) {
        setFormData(prev => ({ ...prev, ...updates }));
      }

      if (response.currentSalesBM) {
        setCurrentSalesBM(response.currentSalesBM);
        setSelectedBM(response.currentSalesBM.bm_contact);
      } else {
        setCurrentSalesBM(undefined);
        setSelectedBM(null);
      }

      setFootfallCount(response.footfallCount || 0);

      setCurrentStep(2);
    } catch {
      toast({ title: 'Error', description: 'Failed to lookup your information. Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalSubmit = async () => {
    setIsLoading(true);
    try {
      const saves: Promise<unknown>[] = [];

      if (userId) {
        const properties: Array<{ property_id: number; value: string }> = [];
        if (formData.userType) properties.push({ property_id: USER_TYPE_PROPERTY_ID, value: formData.userType });
        if (formData.categories.length > 0) properties.push({ property_id: CATEGORIES_PROPERTY_ID, value: formData.categories.join(', ') });
        if (formData.locality.trim()) properties.push({ property_id: LOCALITY_PROPERTY_ID, value: formData.locality.trim() });
        if (properties.length > 0) saves.push(saveUserProperties(userId, properties));
      }

      if (formData.name.trim()) {
        saves.push(updateLeadProperties(formData.phoneNumber, { name: formData.name.trim() }));
      }

      if (formData.categories.length > 0 || formData.userType) {
        saves.push(syncLeadToKylas(
          formData.phoneNumber,
          branch,
          formData.categories,
          formData.userType || '',
          formData.name.trim() || undefined,
        ));
      }

      await Promise.all(saves);
      setCurrentStep(3);
      await loadBMs();
    } catch {
      toast({ title: 'Error', description: 'Failed to save your information. Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBMAssign = async () => {
    if (!selectedBM) return;
    setIsLoading(true);
    try {
      const result = await mockApi.assignBM(formData.phoneNumber, selectedBM);
      const description = result.created
        ? 'Business Manager assigned successfully!'
        : result.reactivated
          ? 'Previous assignment reactivated!'
          : 'Business Manager already assigned and active.';
      toast({ title: 'Done!', description });

      setTimeout(() => {
        setCurrentStep(1);
        setFormData({ phoneNumber: '', name: '', userType: null, categories: [], locality: '', projectType: null, propertyType: null, propertyName: '' });
        setUserId(null);
        setSelectedBM(null);
        setBMs([]);
        setFootfallCount(0);
        setCurrentSalesBM(undefined);
      }, 2000);
    } catch {
      toast({ title: 'Error', description: 'Failed to assign Business Manager. Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategoryToggle = (category: string) => {
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

        {branch && footfallCount > 0 && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
                {footfallCount}
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  {footfallCount === 1 ? 'First Footfall' : footfallCount === 2 ? 'Second Footfall' : `${footfallCount}th Footfall`}
                </p>
                <p className="text-xs text-gray-500">
                  {footfallCount === 1 ? 'Welcome!' : 'Returning customer'}
                </p>
              </div>
            </div>
          </div>
        )}

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
              onLocalityChange={locality => setFormData(prev => ({ ...prev, locality }))}
              onUserTypeChange={userType => setFormData(prev => ({ ...prev, userType }))}
              onCategoryToggle={handleCategoryToggle}
              onSubmit={handleFinalSubmit}
              isLoading={isLoading}
              userTypeProp={userTypeProp}
              categoriesProp={categoriesProp}
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
              currentSalesBM={currentSalesBM}
            />
          )}
        </div>
        {branch && <p className="text-center text-xs text-gray-500 mt-4">Branch: {branch}</p>}
      </div>
    </div>
  );
}
