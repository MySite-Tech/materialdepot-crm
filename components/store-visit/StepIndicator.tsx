import { cn } from "@/lib/utils";
import { FormStep } from "../../types/storeVisit";

interface StepIndicatorProps {
  currentStep: FormStep;
  totalSteps: number;
}

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
        <div
          key={step}
          className={cn(
            "w-2.5 h-2.5 rounded-full transition-all duration-300",
            step === currentStep
              ? "bg-brand-primary w-6"
              : step < currentStep
              ? "bg-brand-primary"
              : "bg-muted"
          )}
        />
      ))}
    </div>
  );
}
