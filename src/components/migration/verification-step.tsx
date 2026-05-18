"use client";

import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMigrationStore } from "@/stores/migration-store";
import { TABLE_PUSH_ORDER } from "@/lib/sync-topology";

interface VerificationStepProps {
  onContinue: () => void;
  verifying: boolean;
}

function tableLabel(name: string): string {
  return name.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

export function VerificationStep({ onContinue, verifying }: VerificationStepProps) {
  const { verificationResults } = useMigrationStore();

  const hasResults = Object.keys(verificationResults).length > 0;
  const allMatch = hasResults && Object.values(verificationResults).every((r) => r.match);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-semibold">Verification</h2>
        <p className="text-sm text-muted-foreground">
          {verifying
            ? "Comparing local and server data…"
            : allMatch
              ? "All tables verified successfully."
              : "Some tables have mismatches — review below."}
        </p>
      </div>

      {verifying && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {hasResults && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {TABLE_PUSH_ORDER.map((name) => {
            const result = verificationResults[name];
            if (!result) return null;
            return (
              <div
                key={name}
                className="flex items-center justify-between text-sm px-2 py-1 rounded-md bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  {result.match ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span>{tableLabel(name)}</span>
                </div>
                <span className="text-muted-foreground text-xs">
                  {result.match ? "Match" : "Mismatch"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {hasResults && (
        <Button onClick={onContinue} className="w-full">
          Continue
        </Button>
      )}
    </div>
  );
}
