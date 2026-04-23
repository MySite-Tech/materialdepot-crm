import { Button } from "@/components/ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { ArrowRight, Loader2 } from "lucide-react";
import { USER_TYPE_OPTIONS, CATEGORY_OPTIONS, FormData } from "../../types/storeVisit";

interface UserProfileStepProps {
  formData: FormData;
  onNameChange: (name: string) => void;
  onUserTypeChange: (userType: keyof typeof USER_TYPE_OPTIONS) => void;
  onCategoryToggle: (category: keyof typeof CATEGORY_OPTIONS) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function UserProfileStep({
  formData,
  onNameChange,
  onUserTypeChange,
  onCategoryToggle,
  onSubmit,
  isLoading,
}: UserProfileStepProps) {
  const userTypeEntries = Object.entries(USER_TYPE_OPTIONS) as [keyof typeof USER_TYPE_OPTIONS, typeof USER_TYPE_OPTIONS[keyof typeof USER_TYPE_OPTIONS]][];
  const categoryEntries = Object.entries(CATEGORY_OPTIONS) as [keyof typeof CATEGORY_OPTIONS, typeof CATEGORY_OPTIONS[keyof typeof CATEGORY_OPTIONS]][];

  const isValid = formData.name.trim() && formData.userType && formData.categories.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) {
      onSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name Field */}
      <div className="space-y-3">
        <Label htmlFor="name" className="text-base font-medium text-foreground">
          Your Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          type="text"
          placeholder="Enter your name"
          value={formData.name}
          onChange={(e) => onNameChange(e.target.value)}
          className="h-12"
        />
      </div>

      {/* User Type Selection */}
      <div className="space-y-3">
        <Label className="text-base font-medium text-foreground">
          What would best describe you? <span className="text-destructive">*</span>
        </Label>
        <RadioGroup
          value={formData.userType || ""}
          onValueChange={(value) => onUserTypeChange(value as keyof typeof USER_TYPE_OPTIONS)}
          className="space-y-2"
        >
          {userTypeEntries.map(([key, option]) => (
            <div
              key={key}
              className="flex items-center space-x-3 p-3 border border-input rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <RadioGroupItem value={key} id={`userType-${key}`} />
              <Label
                htmlFor={`userType-${key}`}
                className="flex-1 cursor-pointer font-normal"
              >
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* Categories Selection */}
      <div className="space-y-3">
        <Label className="text-base font-medium text-foreground">
          Interested categories? <span className="text-destructive">*</span>
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {categoryEntries.map(([key, option]) => (
            <label
              key={key}
              htmlFor={`category-${key}`}
              className="flex items-center space-x-3 p-3 border border-input rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <Checkbox
                id={`category-${key}`}
                checked={formData.categories.includes(key)}
                onCheckedChange={() => onCategoryToggle(key)}
              />
              <span className="flex-1 cursor-pointer font-normal text-sm">
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      <Button
        type="submit"
        className="w-full bg-brand-dark hover:bg-brand-dark/90 text-brand-dark-foreground h-12 text-base font-medium"
        disabled={isLoading || !isValid}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}
