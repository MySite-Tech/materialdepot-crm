import { useState, useEffect } from "react";
import { useToast } from "../hooks/use-toast";
import { HeroBanner } from "../components/store-visit/HeroBanner";
import { StepIndicator } from "../components/store-visit/StepIndicator";
import { PhoneStep } from "../components/store-visit/PhoneSteps";
import { UserProfileStep } from "../components/store-visit/UserProfileStep";
import { BranchSelector } from "../components/store-visit/BranchSelector";
import { lookupLeadByPhone, updateLead, fetchLeadById, getKylasRedirectUrl, searchContactByPhone, fetchBranches, Branch } from "../lib/mockApi";
import {
  FormData,
  FormStep,
  LeadData,
  USER_TYPE_OPTIONS,
  CATEGORY_OPTIONS,
} from "../types/storeVisit";
import { useSearchParams } from "next/navigation";

const initialFormData: FormData = {
  phoneNumber: "",
  name: "",
  userType: null,
  categories: [],
  projectType: null,
  propertyType: null,
  propertyName: "",
};

export default function StoreVisit() {
  const searchParams = useSearchParams();
  const branch = searchParams.get("branch") || "";
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = useState<FormStep>(branch ? 1 : 0 as any);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [leadId, setLeadId] = useState<number | null>(null);
  const [leadData, setLeadData] = useState<LeadData | null>(null);
  const [fullLeadBody, setFullLeadBody] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  const totalSteps = 2;

  // Always fetch branches (needed for ID resolution and selector)
  useEffect(() => {
    setBranchesLoading(true);
    fetchBranches()
      .then(setBranches)
      .catch(() => {
        if (!branch) {
          toast({ title: "Error", description: "Failed to load branches.", variant: "destructive" });
        }
      })
      .finally(() => setBranchesLoading(false));
  }, []);

  // Resolve branch display name to ID
  const branchId = branches.find(
    (b) => b.displayName.toUpperCase() === branch.toUpperCase()
  )?.id;

  const handleBranchSelect = (branchName: string) => {
    // setSearchParams({ branch: branchName });
    setCurrentStep(1);
  };

  // Prefill name and categories from lead data if available
  useEffect(() => {
    if (fullLeadBody) {
      const firstName = fullLeadBody.firstName as string | undefined;
      const lastName = fullLeadBody.lastName as string | undefined;
      const prefillName = firstName?.trim() || lastName?.trim() || "";
      if (prefillName) {
        setFormData((prev) => ({ ...prev, name: prefillName }));
      }
    }
    
    if (leadData?.customFieldValues?.cfCategoriesOfInterest) {
      const existingCategoryIds = leadData.customFieldValues.cfCategoriesOfInterest;
      const categoryKeys = Object.entries(CATEGORY_OPTIONS)
        .filter(([_, option]) => existingCategoryIds.includes(option.id))
        .map(([key]) => key as keyof typeof CATEGORY_OPTIONS);
      
      if (categoryKeys.length > 0) {
        setFormData((prev) => ({ ...prev, categories: categoryKeys }));
      }
    }
  }, [leadData, fullLeadBody]);

  const handlePhoneSubmit = async () => {
    setIsLoading(true);
    try {
      const response = await lookupLeadByPhone(formData.phoneNumber, branch);
      setLeadId(response.leadId);
      setLeadData(response.leadData);
      setFullLeadBody(response.fullLeadBody || null);

      const { cfUserType, cfCategoriesOfInterest } = response.leadData.customFieldValues;

      // Check if both user type AND categories exist
      if (cfUserType && cfCategoriesOfInterest && cfCategoriesOfInterest.length > 0) {
        // Both exist - find contact from conversionDetails array
        const conversionDetails = response.leadData.conversionDetails as Array<{ entityType: string; entityId: number }> | undefined;
        const contactEntity = conversionDetails?.find((item) => item.entityType === "CONTACT");
        
        const redirectUrl = getKylasRedirectUrl(
          response.leadId,
          contactEntity?.entityId
        );
        toast({
          title: "Welcome back!",
          description: "Redirecting to your profile...",
        });
        setTimeout(() => {
          window.open(redirectUrl, "_blank");
          window.location.href = `${window.location.origin}${window.location.pathname}?branch=${branch}`;
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
    // Both user types submit directly from Step 2
    await handleFinalSubmit();
  };

  const handleFinalSubmit = async () => {
    if (!leadId || !leadData) return;

    setIsLoading(true);
    try {
      // Fetch fresh lead data before updating (when userType & categories weren't present)
      const freshLeadData = await fetchLeadById(leadId);
      const leadBodyToUpdate = freshLeadData.fullLeadBody;

      // Build custom field values with option IDs
      const customFieldValues: Record<string, unknown> = {
        cfCategoriesOfInterest: formData.categories.map((cat) => CATEGORY_OPTIONS[cat].id),
        ...(branchId ? { cfBranch: branchId } : {}),
      };

      const updateResponse = await updateLead(leadId, leadBodyToUpdate, customFieldValues, formData.phoneNumber, formData.name);

      toast({
        title: "Thank you!",
        description: "Your information has been saved. Redirecting...",
      });

      // Check if conversionDetails exists in update response
      const contactFromUpdate = updateResponse.conversionDetails?.find((item) => item.entityType === "CONTACT");
      
      if (contactFromUpdate) {
        // conversionDetails found in update response - wait 2 seconds then redirect
        setTimeout(() => {
          const redirectUrl = getKylasRedirectUrl(leadId, contactFromUpdate.entityId);
          window.open(redirectUrl, "_blank");
          window.location.href = `${window.location.origin}${window.location.pathname}?branch=${branch}`;
        }, 2000);
      } else {
        // No conversionDetails - wait 2 seconds, then fetch fresh lead data
        setTimeout(async () => {
          try {
            const freshLead = await fetchLeadById(leadId);
            console.log("[StoreVisit] fetchLeadById response:", freshLead);
            console.log("[StoreVisit] conversionDetails:", freshLead.conversionDetails);
            const contactEntity = freshLead.conversionDetails?.find((item) => item.entityType === "CONTACT");
            console.log("[StoreVisit] contactEntity found:", contactEntity);
            
            if (contactEntity?.entityId) {
              const redirectUrl = getKylasRedirectUrl(leadId, contactEntity.entityId);
              console.log("[StoreVisit] Redirecting to:", redirectUrl);
              window.open(redirectUrl, "_blank");
              window.location.href = `${window.location.origin}${window.location.pathname}?branch=${branch}`;
            } else {
              // Fallback: Search for contact by phone number
              console.log("[StoreVisit] No contact in conversionDetails, trying global search...");
              const searchedContactId = await searchContactByPhone(formData.phoneNumber);
              const redirectUrl = getKylasRedirectUrl(leadId, searchedContactId || undefined);
              console.log("[StoreVisit] Redirecting to:", redirectUrl);
              window.open(redirectUrl, "_blank");
              window.location.href = `${window.location.origin}${window.location.pathname}?branch=${branch}`;
            }
          } catch (error) {
            console.error("[StoreVisit] fetchLeadById error:", error);
            // Fallback: Try global search before giving up
            try {
              const searchedContactId = await searchContactByPhone(formData.phoneNumber);
              const redirectUrl = getKylasRedirectUrl(leadId, searchedContactId || undefined);
              window.open(redirectUrl, "_blank");
            } catch {
              const redirectUrl = getKylasRedirectUrl(leadId);
              window.open(redirectUrl, "_blank");
            }
            window.location.href = `${window.location.origin}${window.location.pathname}?branch=${branch}`;
          }
        }, 2000);
      }
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

  const handleCategoryToggle = (category: keyof typeof CATEGORY_OPTIONS) => {
    setFormData((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      <HeroBanner />

      <div className="max-w-md mx-auto px-4 py-8">
        {/* Welcome Text */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-semibold text-foreground">Welcome!</h2>
          <p className="text-muted-foreground mt-1">We would love to know more about you!</p>
        </div>

        {/* Step Indicator - only show when branch is selected */}
        {branch && <StepIndicator currentStep={currentStep} totalSteps={totalSteps} />}

        {/* Form Steps */}
        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
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

        {/* Branch indicator */}
        {branch && (
          <p className="text-center text-xs text-muted-foreground mt-4">
            Branch: {branch}
          </p>
        )}
      </div>
    </div>
  );
}
