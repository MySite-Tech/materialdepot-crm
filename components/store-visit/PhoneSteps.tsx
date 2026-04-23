import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Loader2 } from "lucide-react";

interface PhoneStepProps {
  phoneNumber: string;
  onPhoneChange: (phone: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function PhoneStep({ phoneNumber, onPhoneChange, onSubmit, isLoading }: PhoneStepProps) {
  const [error, setError] = useState<string>("");

  const validatePhone = (phone: string): boolean => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length !== 10) {
      setError("Please enter a valid 10-digit phone number");
      return false;
    }
    setError("");
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validatePhone(phoneNumber)) {
      onSubmit();
    }
  };

  const handlePhoneChange = (value: string) => {
    // Only allow digits
    const cleaned = value.replace(/\D/g, "").slice(0, 10);
    onPhoneChange(cleaned);
    if (error) setError("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="phone" className="text-base font-medium text-foreground">
          Phone Number <span className="text-destructive">*</span>
        </Label>
        <div className="flex">
          <div className="flex items-center px-3 bg-muted border border-r-0 border-input rounded-l-md">
            <span className="text-muted-foreground text-sm">+91</span>
          </div>
          <Input
            id="phone"
            type="tel"
            placeholder="Enter your phone number"
            value={phoneNumber}
            onChange={(e) => handlePhoneChange(e.target.value)}
            className="rounded-l-none text-base"
            disabled={isLoading}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <Button
        type="submit"
        className="w-full bg-brand-dark hover:bg-brand-dark/90 text-brand-dark-foreground h-12 text-base font-medium"
        disabled={isLoading || !phoneNumber}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Looking up...
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
