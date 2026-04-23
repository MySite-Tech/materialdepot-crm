import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin } from "lucide-react";
import { Branch } from "../../lib/mockApi";

interface BranchSelectorProps {
  branches: Branch[];
  isLoading: boolean;
  onSelect: (branchName: string) => void;
}

export function BranchSelector({ branches, isLoading, onSelect }: BranchSelectorProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Loading branches...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Label className="text-base font-medium text-foreground">
        Select your branch <span className="text-destructive">*</span>
      </Label>
      <div className="grid gap-3">
        {branches.map((branch) => (
          <Button
            key={branch.id}
            variant="outline"
            className="w-full h-12 justify-start text-base font-medium border-border hover:bg-accent hover:text-accent-foreground"
            onClick={() => onSelect(branch.displayName)}
          >
            <MapPin className="mr-3 h-4 w-4 text-muted-foreground" />
            {branch.displayName}
          </Button>
        ))}
      </div>
    </div>
  );
}
